import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../_lib/requireAuth.js";
import { logger } from "../../../src/logger.js";
import { regenerateDraftImage } from "../../../src/workflows/wf4_repurposeReview.js";

/**
 * POST /api/drafts/:id/regenerate-image — retry a failed (or unwanted)
 * Instagram image generation (audit Phase 1 quick win). Previously the only
 * recourse for a bad or missing AI image was rejecting the whole draft.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
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
    const draft = await regenerateDraftImage(draftId);
    res.status(200).json({ ok: true, mediaAssetId: draft.media_asset_id });
  } catch (err) {
    logger.error({ err, draftId }, "regenerate image failed");
    res.status(400).json({ error: err instanceof Error ? err.message : "regenerate failed" });
  }
}
