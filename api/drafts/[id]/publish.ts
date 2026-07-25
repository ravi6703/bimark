import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../_lib/requireAuth.js";
import { logger } from "../../../src/logger.js";
import { publishHeldDraft } from "../../../src/workflows/wf5_approvalCallback.js";

/**
 * POST /api/drafts/:id/publish — manual publish trigger for a held draft
 * (WF-5b, §20). Only valid on drafts approved with `hold: true`.
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
    const post = await publishHeldDraft(draftId, {
      mediaUrls: Array.isArray(req.body?.mediaUrls) ? req.body.mediaUrls : undefined,
    });
    res.status(200).json({ ok: true, post });
  } catch (err) {
    logger.error({ err, draftId }, "held draft publish failed");
    res.status(400).json({ error: err instanceof Error ? err.message : "publish failed" });
  }
}
