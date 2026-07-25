import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../_lib/requireAuth.js";
import { logger } from "../../../src/logger.js";
import { approvals } from "../../../src/db/repositories/index.js";

/**
 * GET /api/drafts/:id/activity — a draft's audit trail (audit Phase 2).
 * Makes Phase 0's real per-person approver identity actually visible
 * somewhere — previously the approvals table existed but nothing in the
 * dashboard rendered it, so "who did what" was invisible even once it
 * started being recorded correctly.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  const draftId = Number(req.query.id);
  if (!Number.isInteger(draftId) || draftId <= 0) {
    res.status(400).json({ error: "invalid draft id" });
    return;
  }
  try {
    const activity = await approvals.listForDraft(draftId);
    res.status(200).json({ ok: true, activity });
  } catch (err) {
    logger.error({ err, draftId }, "activity list failed");
    res.status(500).json({ error: "internal error" });
  }
}
