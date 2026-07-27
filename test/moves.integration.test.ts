import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { closePool, query } from "../src/db/pool.js";
import { migrate } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";
import {
  brands,
  channels,
  drafts,
  outcomes,
  pillars,
  timeBaselines,
  topics,
} from "../src/db/repositories/index.js";
import { assessBrand } from "../src/brand/readiness.js";
import { buildScoreboard, weekStart } from "../src/scoreboard/index.js";
import { promptVersionReport } from "../src/eval/report.js";
import { harvestCases, listCases } from "../src/eval/goldenSet.js";

/**
 * Integration coverage for the six moves. Runs only with a real Postgres.
 *
 * Uses its own brand throughout: an earlier round of this suite was broken by
 * two files both mutating brand 1's weekly targets, and the scoreboard's
 * cadence assertions are exactly the kind of thing that would silently start
 * reading another test's data.
 */
const RUN = config.db.enabled;
const d = RUN ? describe : describe.skip;

d("Moves 1-6", () => {
  let brandId: number;

  beforeAll(async () => {
    await migrate();
    // Seed before creating our own brand. Other suites resolve their brand via
    // brands.first(), which is ORDER BY id — if this file won the race and
    // took id 1, those suites would silently run against a brand with no
    // owned material and fail on retrieval. seed() is advisory-locked and
    // idempotent, so calling it here is safe and makes the ordering explicit.
    await seed();
    const brand = await brands.create({
      name: "Moves Test Brand",
      slug: `moves-test-${Date.now()}`,
      voice_guide: "A deliberately long voice guide so the readiness check for it passes cleanly.",
    });
    brandId = brand.id;
  });

  afterAll(async () => {
    await closePool();
  });

  // ── Move 1 ────────────────────────────────────────────────────────────────
  it("records outcomes and totals them for the window", async () => {
    const wk = weekStart(new Date()).toISOString().slice(0, 10);
    await outcomes.record({
      brand_id: brandId,
      period_start: wk,
      leads: 4,
      signups: 1,
      recorded_by: "tester",
    });
    await outcomes.record({
      brand_id: brandId,
      period_start: wk,
      leads: 2,
      signups: 0,
      source: "analytics",
      recorded_by: "tester",
    });
    const totals = await outcomes.totalsSince(brandId, wk);
    expect(totals).toEqual({ leads: 6, signups: 1, entries: 2 });
  });

  it("keeps baseline history rather than overwriting the estimate", async () => {
    await timeBaselines.record({
      brand_id: brandId,
      minutes_per_post_before: 90,
      minutes_per_post_after: 20,
      recorded_by: "tester",
    });
    await timeBaselines.record({
      brand_id: brandId,
      minutes_per_post_before: 90,
      minutes_per_post_after: 15,
      recorded_by: "tester",
    });
    const current = await timeBaselines.current(brandId);
    expect(current!.minutes_per_post_after).toBe(15);
    const { rows } = await query<{ n: number }>(
      "SELECT count(*)::int AS n FROM time_baselines WHERE brand_id = $1",
      [brandId],
    );
    // The superseded estimate is still on record, so past reporting stays
    // reproducible instead of being silently rewritten.
    expect(Number(rows[0]!.n)).toBe(2);
  });

  // ── Move 2 ────────────────────────────────────────────────────────────────
  it("anchors the scoreboard week to Monday", () => {
    // A Wednesday and the Sunday after it belong to the same week.
    expect(weekStart(new Date("2026-07-29T12:00:00Z")).toISOString().slice(0, 10)).toBe("2026-07-27");
    expect(weekStart(new Date("2026-08-02T23:00:00Z")).toISOString().slice(0, 10)).toBe("2026-07-27");
    // Monday itself is its own week start.
    expect(weekStart(new Date("2026-07-27T00:00:00Z")).toISOString().slice(0, 10)).toBe("2026-07-27");
  });

  it("reports hours as unconfigured until a baseline exists, then as an estimate", async () => {
    const fresh = await brands.create({ name: "No Baseline", slug: `nb-${Date.now()}` });
    const before = await buildScoreboard(fresh.id);
    expect(before.hours.configured).toBe(false);

    const after = await buildScoreboard(brandId);
    expect(after.hours.configured).toBe(true);
    if (after.hours.configured) {
      // The multiplier is a human estimate; the flag is what every rendering
      // surface keys off to say so.
      expect(after.hours.estimateBased).toBe(true);
      expect(after.hours.minutesPerPostBefore).toBe(90);
    }
  });

  it("reports inbound alongside how much is attributable at all", async () => {
    const sb = await buildScoreboard(brandId);
    expect(sb.inbound.leads).toBe(6);
    // Nothing published for this brand, so coverage is honestly zero of zero
    // rather than a misleading 100%.
    expect(sb.inbound.totalPosts).toBe(0);
    expect(sb.inbound.attributablePosts).toBe(0);
  });

  it("reports cadence against the channel targets that are actually set", async () => {
    await channels.upsert(brandId, "linkedin", { weekly_target: 3 });
    await channels.upsert(brandId, "x", { weekly_target: 2 });
    const sb = await buildScoreboard(brandId);
    expect(sb.cadence.target).toBe(5);
    expect(sb.cadence.published).toBe(0);
    expect(sb.cadence.byPlatform.map((l) => l.platform).sort()).toEqual(["linkedin", "x"]);
  });

  it("leaves queue rates null rather than reporting a confident zero on no data", async () => {
    const sb = await buildScoreboard(brandId);
    // No decisions yet — a 0% approval rate would read as "everything is being
    // rejected", which is the opposite of the truth.
    expect(sb.queue.firstPassApprovalRate).toBeNull();
    expect(sb.queue.medianHoursToDecision).toBeNull();
    expect(sb.queue.sample).toBe(0);
  });

  // ── Move 4 ────────────────────────────────────────────────────────────────
  it("defaults pillars to authority and only converts on an explicit change", async () => {
    const p = await pillars.create({ brand_id: brandId, name: "Applied assessment" });
    expect(p.intent).toBe("authority");
    expect(p.conversion_target).toBeNull();

    const converted = await pillars.update(p.id, {
      intent: "conversion",
      conversion_target: "the placement programme page",
    });
    expect(converted!.intent).toBe("conversion");
    expect(converted!.conversion_target).toBe("the placement programme page");

    // Switching back must drop the offer, not leave it to leak into copy.
    const back = await pillars.update(p.id, { intent: "authority", conversion_target: null });
    expect(back!.intent).toBe("authority");
    expect(back!.conversion_target).toBeNull();
  });

  // ── Move 5 ────────────────────────────────────────────────────────────────
  it("preserves the AI's original body when a human edits the draft", async () => {
    const topic = await topics.create({
      brand_id: brandId,
      source: "manual",
      angle: "A topic for the eval harness",
      platform: "linkedin",
      status: "picked",
      priority: 10,
    });
    const draft = await drafts.create({
      topic_id: topic.id,
      platform: "linkedin",
      body: "What the AI wrote.",
      variants: [],
      claims_used: [],
      low_source: false,
      model_used: "mock",
      prompt_version: "vtest",
      reviewer_result: { verdict: "pass", flags: [], notes: "" },
      review_retries: 0,
      status: "pending_approval",
    });
    expect(draft.ai_body).toBe("What the AI wrote.");

    await drafts.setBody(draft.id, "What a human published.", "edited");
    const after = await drafts.get(draft.id);
    // This is the whole point: the reference half of an eval case has to
    // survive the edit that makes the case interesting.
    expect(after!.body).toBe("What a human published.");
    expect(after!.ai_body).toBe("What the AI wrote.");

    await query(
      "INSERT INTO approvals (draft_id, approver, action, edit_distance) VALUES ($1,$2,'edit',$3)",
      [draft.id, "tester", 120],
    );
  });

  it("harvests a golden-set case from that real edit, and is idempotent", async () => {
    const first = await harvestCases(brandId, "tester");
    expect(first.added).toBe(1);
    const cases = await listCases(brandId);
    expect(cases[0]!.ai_body).toBe("What the AI wrote.");
    expect(cases[0]!.human_body).toBe("What a human published.");

    // Re-running must not duplicate: the unique index on source_draft_id is
    // what makes "just run it again" a safe habit.
    const second = await harvestCases(brandId, "tester");
    expect(second.added).toBe(0);
    expect((await listCases(brandId)).length).toBe(1);
  });

  it("groups the prompt-version report by the version that produced each draft", async () => {
    const report = await promptVersionReport(brandId);
    const vtest = report.find((r) => r.promptVersion === "vtest");
    expect(vtest).toBeTruthy();
    expect(vtest!.decided).toBe(1);
    // The one decision was an edit, not a clean approve.
    expect(vtest!.firstPassApprovalRate).toBe(0);
    expect(vtest!.meanEditDistance).toBe(120);
  });

  // ── Move 6 ────────────────────────────────────────────────────────────────
  it("blocks on missing owned material, and says so before the work not after", async () => {
    const brand = await brands.get(brandId);
    const readiness = await assessBrand(brand!);
    expect(readiness.level).toBe("empty");
    expect(readiness.blockingReason).toContain("no owned material");

    const material = readiness.checks.find((c) => c.key === "owned_material")!;
    expect(material.ok).toBe(false);
    expect(material.blocking).toBe(true);
    // Every failing check has to carry the concrete next action, not just a
    // red mark — that's the difference between honest and merely discouraging.
    for (const c of readiness.checks.filter((x) => !x.ok)) {
      expect(c.fix).toBeTruthy();
    }
  });

  it("stops blocking once real material is indexed", async () => {
    for (let i = 0; i < 5; i++) {
      await query(
        `INSERT INTO owned_assets (brand_id, source_type, source_ref, title, chunk_text, chunk_index)
         VALUES ($1,'manual',$2,$3,$4,$5)`,
        [brandId, `test:doc-${i}`, `Doc ${i}`, `Some real owned material number ${i}.`, i],
      );
    }
    const brand = await brands.get(brandId);
    const readiness = await assessBrand(brand!);
    expect(readiness.level).not.toBe("empty");
    expect(readiness.blockingReason).toBeNull();
    expect(readiness.checks.find((c) => c.key === "owned_material")!.ok).toBe(true);
  });
});
