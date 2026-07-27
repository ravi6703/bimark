import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { closePool, query } from "../src/db/pool.js";
import { migrate } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";
import { channels } from "../src/db/repositories/index.js";
import { pickPitchPlatform } from "../src/workflows/wf1_morningPitch.js";
import { buildFeed } from "../src/feed/index.js";

/**
 * Channel cadence config (migration 016). weekly_target now decides which
 * channel the morning pitch targets, so it's editable from the dashboard —
 * which means it needs a uniqueness guarantee to upsert against, and that
 * guarantee is the thing worth proving.
 */
const RUN = config.db.enabled;
const d = RUN ? describe : describe.skip;

d("channel cadence config", () => {
  let brandId: number;

  beforeAll(async () => {
    await migrate();
    await seed();
    // Its own brand rather than the seeded one — other integration suites
    // configure channels on that brand too, and a shared target would make
    // "furthest behind" a tie between suites rather than a real assertion.
    const { rows } = await query<{ id: number }>(
      `INSERT INTO brands (name, slug) VALUES ('Cadence Test Co', 'cadence-test-co')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    brandId = rows[0]!.id;
  });

  afterAll(async () => {
    await closePool();
  });

  it("creates a config for a channel the brand has never configured", async () => {
    const created = await channels.upsert(brandId, "youtube", { weekly_target: 2 });
    expect(created.platform).toBe("youtube");
    expect(created.weekly_target).toBe(2);
    expect(created.active).toBe(true);
  });

  it("updates in place rather than accumulating rows for the same channel", async () => {
    await channels.upsert(brandId, "youtube", { weekly_target: 5 });
    await channels.upsert(brandId, "youtube", { weekly_target: 9 });

    const { rows } = await query<{ n: number }>(
      "SELECT count(*)::int AS n FROM channel_configs WHERE brand_id = $1 AND platform = 'youtube'",
      [brandId],
    );
    expect(rows[0]!.n).toBe(1);

    const all = await channels.listAll(brandId);
    expect(all.find((c) => c.platform === "youtube")!.weekly_target).toBe(9);
  });

  it("leaves untouched fields alone — pausing keeps the target", async () => {
    await channels.upsert(brandId, "youtube", { active: false });
    const paused = (await channels.listAll(brandId)).find((c) => c.platform === "youtube")!;
    expect(paused.active).toBe(false);
    expect(paused.weekly_target).toBe(9); // not reset by the partial patch
  });

  it("a paused channel drops out of the morning pitch rotation", async () => {
    // YouTube has by far the largest target, so it would win outright — but
    // channels.list() returns active channels only, so it must not be picked.
    await channels.upsert(brandId, "youtube", { weekly_target: 99, active: false });
    expect(await pickPitchPlatform(brandId)).not.toBe("youtube");

    // Re-activated, the same target makes it the obvious pick.
    await channels.upsert(brandId, "youtube", { active: true });
    expect(await pickPitchPlatform(brandId)).toBe("youtube");
  });
});

d("agent feed", () => {
  let feedBrandId: number;

  beforeAll(async () => {
    await migrate();
    await seed();
    const { rows } = await query<{ id: number }>(
      `INSERT INTO brands (name, slug) VALUES ('Feed Test Co', 'feed-test-co')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    feedBrandId = rows[0]!.id;
  });

  it("is empty for a brand nothing has happened to", async () => {
    expect(await buildFeed(feedBrandId)).toEqual([]);
  });

  it("separates what needs a human from what's just news, newest first", async () => {
    // Actionable: a Reddit thread nobody has triaged.
    await query(
      `INSERT INTO reddit_opportunities (brand_id, subreddit, thread_title, thread_url, status)
       VALUES ($1,'humanresources','A thread worth joining','https://reddit.test/a','new')`,
      [feedBrandId],
    );
    // Informational: an auto-detected competitor mention.
    await query(
      `INSERT INTO competitor_notes (brand_id, competitor_name, summary, added_by)
       VALUES ($1,'Superset','Superset raised a round','auto-monitor')`,
      [feedBrandId],
    );
    // Neither: a competitor note a teammate wrote by hand isn't agent output.
    await query(
      `INSERT INTO competitor_notes (brand_id, competitor_name, summary, added_by)
       VALUES ($1,'Mettl','Something I noticed myself','ravi')`,
      [feedBrandId],
    );

    const feed = await buildFeed(feedBrandId);
    expect(feed.map((i) => i.kind).sort()).toEqual(["competitor", "reddit"]);
    expect(feed.find((i) => i.kind === "reddit")!.actionable).toBe(true);
    expect(feed.find((i) => i.kind === "competitor")!.actionable).toBe(false);
    // Sorted newest first.
    expect([...feed].sort((a, b) => b.at.localeCompare(a.at))).toEqual(feed);
  });

  it("ignores anything older than the lookback window", async () => {
    await query(
      `INSERT INTO competitor_notes (brand_id, competitor_name, summary, added_by, created_at)
       VALUES ($1,'Unstop','Ancient news','auto-monitor', now() - interval '60 days')`,
      [feedBrandId],
    );
    const feed = await buildFeed(feedBrandId);
    expect(feed.some((i) => i.detail === "Ancient news")).toBe(false);
  });
});
