import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { closePool, query } from "../src/db/pool.js";
import { migrate } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";
import { brands, campaigns, topics } from "../src/db/repositories/index.js";

/**
 * Migration 015's backfill, exercised against a real Postgres. The backfill
 * reconstructs campaigns from history — topics sharing a (brand, angle) and
 * created within seconds of each other were one multi-platform idea — so the
 * grouping logic is the part worth proving before it runs on real data.
 *
 * Runs ONLY when DATABASE_URL is set, like the other integration test.
 */
const RUN = config.db.enabled;
const d = RUN ? describe : describe.skip;

d("migration 015: campaign backfill + repo", () => {
  let brandId: number;

  beforeAll(async () => {
    await migrate();
    await seed();
    const b = await brands.first();
    brandId = b!.id;
  });

  afterAll(async () => {
    await closePool();
  });

  /** Re-runs 015's backfill block over whatever is currently unassigned. */
  async function runBackfill(): Promise<void> {
    await query(`
      DO $$
      DECLARE
        rec RECORD;
        new_campaign_id INT;
      BEGIN
        FOR rec IN
          WITH marked AS (
            SELECT id, brand_id, angle, created_at, pillar_id, why_now, must_say,
                   source_asset_id, source,
                   CASE WHEN LAG(created_at) OVER w IS NULL
                          OR created_at - LAG(created_at) OVER w > interval '10 seconds'
                        THEN 1 ELSE 0 END AS is_new_group
              FROM topics
             WHERE campaign_id IS NULL
            WINDOW w AS (PARTITION BY brand_id, angle ORDER BY created_at, id)
          ),
          grouped AS (
            SELECT *, SUM(is_new_group) OVER (PARTITION BY brand_id, angle ORDER BY created_at, id) AS grp
              FROM marked
          )
          SELECT brand_id, angle,
                 array_agg(id ORDER BY created_at, id) AS topic_ids,
                 min(created_at) AS created_at,
                 (array_agg(pillar_id       ORDER BY created_at, id))[1] AS pillar_id,
                 (array_agg(why_now         ORDER BY created_at, id))[1] AS why_now,
                 (array_agg(must_say        ORDER BY created_at, id))[1] AS must_say,
                 (array_agg(source_asset_id ORDER BY created_at, id))[1] AS source_asset_id,
                 (array_agg(source          ORDER BY created_at, id))[1] AS source
            FROM grouped
           GROUP BY brand_id, angle, grp
        LOOP
          INSERT INTO campaigns
            (brand_id, title, pillar_id, source, why_now, must_say, source_asset_id, created_by, created_at)
          VALUES
            (rec.brand_id, COALESCE(rec.angle, '(untitled)'), rec.pillar_id, rec.source,
             rec.why_now, rec.must_say, rec.source_asset_id, 'backfill', rec.created_at)
          RETURNING id INTO new_campaign_id;
          UPDATE topics SET campaign_id = new_campaign_id WHERE id = ANY(rec.topic_ids);
        END LOOP;
      END $$;
    `);
  }

  it("groups same-angle topics written together into one campaign, and splits distinct ideas", async () => {
    // Three platforms of ONE idea, as WF-3's loop would have written them.
    const oneIdea = "Why applied assessment predicts on-the-job performance";
    for (const platform of ["linkedin", "x", "geo"]) {
      await topics.create({
        brand_id: brandId,
        source: "manual",
        angle: oneIdea,
        why_now: "operator-seeded",
        platform,
        status: "picked",
      });
    }
    // A genuinely different idea, written at the same time.
    await topics.create({
      brand_id: brandId,
      source: "manual",
      angle: "A completely different angle about hiring",
      platform: "linkedin",
      status: "picked",
    });

    await runBackfill();

    const { rows } = await query<{ title: string; n: number }>(
      `SELECT c.title, count(t.id)::int AS n
         FROM campaigns c JOIN topics t ON t.campaign_id = c.id
        WHERE c.brand_id = $1 AND c.title IN ($2, $3)
        GROUP BY c.id, c.title`,
      [brandId, oneIdea, "A completely different angle about hiring"],
    );
    const byTitle = Object.fromEntries(rows.map((r) => [r.title, r.n]));

    expect(byTitle[oneIdea]).toBe(3); // one campaign, three channels
    expect(byTitle["A completely different angle about hiring"]).toBe(1);
  });

  it("splits the same angle re-run later into separate campaigns, not one merged blob", async () => {
    const angle = "An angle used twice, weeks apart";
    await query(
      `INSERT INTO topics (brand_id, source, angle, platform, status, created_at)
       VALUES ($1,'manual',$2,'linkedin','picked', now() - interval '30 days'),
              ($1,'manual',$2,'x',       'picked', now() - interval '30 days'),
              ($1,'manual',$2,'linkedin','picked', now()),
              ($1,'manual',$2,'x',       'picked', now())`,
      [brandId, angle],
    );

    await runBackfill();

    const { rows } = await query<{ n: number }>(
      "SELECT count(*)::int AS n FROM campaigns WHERE brand_id = $1 AND title = $2",
      [brandId, angle],
    );
    // Two runs of the same idea a month apart are two campaigns, not one.
    expect(rows[0]!.n).toBe(2);
  });

  it("leaves no topic unassigned, and is safe to re-run", async () => {
    await runBackfill(); // idempotent: only touches campaign_id IS NULL
    const { rows } = await query<{ n: number }>(
      "SELECT count(*)::int AS n FROM topics WHERE campaign_id IS NULL",
    );
    expect(rows[0]!.n).toBe(0);
  });

  it("listWithChannels returns each idea once, with its channels and draft state", async () => {
    const list = await campaigns.listWithChannels(brandId, 100);
    expect(list.length).toBeGreaterThan(0);

    // The three-channel idea seeded in the first test — matched by title so
    // this doesn't accidentally pick up another test's campaign.
    const threeChannel = list.filter(
      (c) => c.title === "Why applied assessment predicts on-the-job performance",
    );
    expect(threeChannel).toHaveLength(1); // the idea appears ONCE, not once per channel
    expect(threeChannel[0]!.channels.map((c) => c.platform).sort()).toEqual([
      "geo",
      "linkedin",
      "x",
    ]);
    for (const ch of threeChannel[0]!.channels) {
      expect(ch.topicId).toBeGreaterThan(0);
      expect(ch.status).toBeTruthy();
    }
  });
});
