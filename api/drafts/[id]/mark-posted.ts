import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../_lib/requireAuth.js";
import { logger } from "../../../src/logger.js";
import { markManuallyPosted } from "../../../src/workflows/wf5_approvalCallback.js";

/**
 * POST /api/drafts/:id/mark-posted — GEO/YouTube's equivalent of the publish
 * button (Okara-inspired follow-up). Neither has a platform API to auto-post
 * to (no "post to ChatGPT," no video to auto-upload), so the operator places
 * it manually and then marks it posted here — same recordkeeping (a `posts`
 * row) as a real publish, just without calling a publisher.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const me = requireAuth(req, res);
  if (!me) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const draftId = Number(req.query.id);
  if (!Number.isInteger(draftId) || draftId <= 0) {
    res.status(400).json({ error: "invalid draft id" });
    return;
  }

  try {
    const post = await markManuallyPosted(draftId, me.name);
    res.status(200).json({ ok: true, post });
  } catch (err) {
    logger.error({ err, draftId }, "mark-posted failed");
    res.status(400).json({ error: err instanceof Error ? err.message : "mark-posted failed" });
  }
}
