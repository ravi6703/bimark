import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../_lib/requireAuth.js";
import { logger } from "../../../src/logger.js";
import { finalizeDraft } from "../../../src/workflows/wf5_approvalCallback.js";

/**
 * POST /api/drafts/:id/action — the dashboard's approve/edit/reject button.
 * Body: { decision: "approve"|"reject", editedText?, mediaUrls?, reason? }.
 * Mirrors what the Telegram approve/edit/reject buttons do (WF-5) — same
 * underlying finalizeDraft, same audit trail, same publish path.
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

  const decision = req.body?.decision;
  if (decision !== "approve" && decision !== "reject") {
    res.status(400).json({ error: 'decision must be "approve" or "reject"' });
    return;
  }

  try {
    const result = await finalizeDraft({
      draftId,
      decision,
      editedText: typeof req.body?.editedText === "string" ? req.body.editedText : undefined,
      mediaUrls: Array.isArray(req.body?.mediaUrls) ? req.body.mediaUrls : undefined,
      reason: typeof req.body?.reason === "string" ? req.body.reason : undefined,
      approver: "dashboard",
    });
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err, draftId }, "draft action failed");
    res.status(400).json({ error: err instanceof Error ? err.message : "action failed" });
  }
}
