import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { resolveBrandId } from "../_lib/brand.js";
import { logger } from "../../src/logger.js";
import { topics } from "../../src/db/repositories/index.js";
import {
  runRepurposeReview,
  TopicAlreadyGeneratingError,
} from "../../src/workflows/wf4_repurposeReview.js";

/**
 * POST /api/topics/generate { topicId } — generate the draft for ONE queued
 * topic (WF-4).
 *
 * The counterpart to the now-async intake: the dashboard queues a topic per
 * platform, then calls this once per topic in parallel, so each platform gets
 * its own 60s function budget instead of sharing one with every other
 * platform. Also the retry path for a topic whose generation failed — WF-4
 * releases a failed topic back to `picked`, so calling this again just works.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const topicId = Number(req.body?.topicId);
  if (!Number.isInteger(topicId) || topicId <= 0) {
    res.status(400).json({ error: "topicId is required" });
    return;
  }
  try {
    // Scope to the selected brand's workspace — a topic id alone must not be
    // enough to generate into another brand (multi-brand support).
    const brandId = await resolveBrandId(req);
    const topic = await topics.get(topicId);
    if (!topic || topic.brand_id !== brandId) {
      res.status(404).json({ error: "topic not found" });
      return;
    }

    const draft = await runRepurposeReview(topicId);
    res.status(200).json({ ok: true, platform: draft.platform, topicId, draftId: draft.id });
  } catch (err) {
    if (err instanceof TopicAlreadyGeneratingError) {
      // Someone else (another tab, or the drain cron) got there first — not an
      // error worth surfacing as a failure, the draft is already on its way.
      res.status(409).json({ error: "This topic is already being generated." });
      return;
    }
    logger.error({ err, topicId }, "topic generate failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "generation failed" });
  }
}
