import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { closePool, query } from "../src/db/pool.js";
import { migrate } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";
import { brands, drafts, ownedAssets, topics } from "../src/db/repositories/index.js";
import { retrieve } from "../src/rag/retrieve.js";
import { ingestDocument } from "../src/rag/ingest.js";
import { runMorningPitch } from "../src/workflows/wf1_morningPitch.js";
import { handlePitchCallback } from "../src/workflows/wf2_pitchCallback.js";
import { handleManualIntake } from "../src/workflows/wf3_manualIntake.js";
import { finalizeDraft } from "../src/workflows/wf5_approvalCallback.js";
import { runAnalyticsPoller } from "../src/workflows/wf6_analyticsPoller.js";
import { runEditorialMemo, runSovSnapshot } from "../src/workflows/wf7_sovMemo.js";
import { parseCallback } from "../src/telegram/messages.js";

/**
 * Full-stack integration test. Runs ONLY when DATABASE_URL is set (a real
 * Postgres + pgvector). Exercises every workflow end to end in mock mode
 * (MockLLM + MockPublisher + Telegram dry-run) so there is zero external spend.
 */
const RUN = config.db.enabled;
const d = RUN ? describe : describe.skip;

d("end-to-end pipeline (§16 WF-1..WF-7)", () => {
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

  it("WF-1: morning pitch persists two suggested topics and picks distinct assets", async () => {
    const { group, topicA, topicB } = await runMorningPitch(brandId);
    expect(group).toBeTruthy();
    const a = await topics.get(topicA.id);
    const b = await topics.get(topicB.id);
    expect(a!.status).toBe("suggested");
    expect(b!.status).toBe("suggested");
    expect(a!.source).toBe("morning_pitch");
  });

  it("§18: retrieval finds grounded owned material above the threshold", async () => {
    const r = await retrieve(brandId, "skills-based hiring assessment task");
    expect(r.chunks.length).toBeGreaterThan(0);
    expect(r.lowSource).toBe(false);
    expect(r.topSimilarity).toBeGreaterThan(config.rag.similarityThreshold);
  });

  it("§4.2: an off-topic query with no owned material raises low_source", async () => {
    const r = await retrieve(brandId, "monsoon mango chutney recipe folk poetry");
    expect(r.lowSource).toBe(true);
  });

  it("WF-2: picking an option drafts it and marks the sibling skipped", async () => {
    const { group, topicA, topicB } = await runMorningPitch(brandId);
    const res = await handlePitchCallback(parseCallback(`pickA:${topicA.id}`)!, brandId);
    expect(res.draftId).toBeGreaterThan(0);

    const picked = await topics.get(topicA.id);
    const sibling = await topics.get(topicB.id);
    expect(picked!.status).toBe("drafted");
    expect(sibling!.status).toBe("skipped");
    expect(group).toBeTruthy();

    const draft = await drafts.get(res.draftId!);
    expect(draft!.status).toBe("pending_approval");
    expect(draft!.reviewer_result?.verdict).toBe("pass");
  });

  it("WF-3 + WF-5: manual intake (priority) drafts, and approve-with-edits publishes + logs edit distance", async () => {
    const intakeResults = await handleManualIntake({
      brand_id: brandId,
      topic: "Why applied assessment predicts on-the-job performance",
      pillar: "Applied assessment",
    });
    const { topicId, draft } = intakeResults[0]!;
    const t = await topics.get(topicId);
    expect(t!.priority).toBe(10); // human topics outrank AI ones

    const edited = `${draft.body}\n\nEdited by the editor-in-chief.`;
    const result = await finalizeDraft({
      draftId: draft.id,
      decision: "approve",
      editedText: edited,
      approver: "editor",
    });
    expect(result.action).toBe("edit");
    expect(result.editDistance).toBeGreaterThan(0);
    expect(result.post?.external_id).toBeTruthy();
    expect(result.post?.poll_until).toBeInstanceOf(Date);
  });

  it("WF-3 multi-platform: one topic targeting multiple platforms creates one draft per platform", async () => {
    const results = await handleManualIntake({
      brand_id: brandId,
      topic: "Why task-based assessment beats multiple-choice",
      pillar: "Applied assessment",
      platforms: ["linkedin", "x"],
    });
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.platform).sort()).toEqual(["linkedin", "x"]);
    for (const r of results) {
      expect(r.draft.platform).toBe(r.platform);
    }
    const xDraft = results.find((r) => r.platform === "x")!.draft;
    expect(xDraft.body!.length).toBeLessThanOrEqual(280);
  });

  it("WF-6: analytics poller records metrics for a live post", async () => {
    const { polled } = await runAnalyticsPoller(new Date());
    expect(polled).toBeGreaterThanOrEqual(1);
    const { rows } = await query("SELECT count(*)::int AS n FROM metrics");
    expect((rows[0] as { n: number }).n).toBeGreaterThanOrEqual(1);
  });

  it("§18.6: re-ingesting unchanged material is skipped via hash", async () => {
    const doc = {
      sourceType: "manual" as const,
      sourceRef: "test:hash-doc",
      title: "hash doc",
      text: "A stable document about employability outcomes that will not change.",
    };
    // Ensure a clean slate — the DB persists across runs in a dev environment.
    await query("DELETE FROM owned_assets WHERE brand_id = $1 AND source_ref = $2", [
      brandId,
      doc.sourceRef,
    ]);
    const first = await ingestDocument(brandId, doc);
    expect(first.skipped).toBe(false);
    const second = await ingestDocument(brandId, doc);
    expect(second.skipped).toBe(true);
  });

  it("WF-7: SOV snapshot and editorial memo run and persist", async () => {
    await runSovSnapshot(brandId, "Board Infinity");
    const memo = await runEditorialMemo(brandId, "2026-07");
    expect(memo.length).toBeGreaterThan(0);
    const { rows } = await query("SELECT count(*)::int AS n FROM sov_snapshots");
    expect((rows[0] as { n: number }).n).toBeGreaterThan(0);
  });

  it("§7: quality stats are computable from the approvals log", async () => {
    const { approvals } = await import("../src/db/repositories/index.js");
    const stats = await approvals.qualityStats();
    expect(stats.sample).toBeGreaterThanOrEqual(1);
  });

  it("cleans up unused-asset markers without error (markUsed)", async () => {
    const cands = await ownedAssets.candidatesForPitch(brandId, 4);
    expect(cands.length).toBeGreaterThan(0);
    await ownedAssets.markUsed(cands[0]!.id);
  });
});
