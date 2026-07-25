import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { resolveBrandId } from "../_lib/brand.js";
import { logger } from "../../src/logger.js";
import { drafts } from "../../src/db/repositories/index.js";
import type { DraftStatus } from "../../src/types.js";

const VALID_STATUSES = new Set<DraftStatus>([
  "generating",
  "in_review",
  "flagged",
  "pending_approval",
  "approved",
  "approved_hold",
  "edited",
  "rejected",
]);

/** GET /api/drafts?status=&limit= — the review queue. Defaults to pending_approval. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  try {
    const brandId = await resolveBrandId();
    const statusParam = typeof req.query.status === "string" ? req.query.status : "pending_approval";
    const status =
      statusParam === "all"
        ? undefined
        : VALID_STATUSES.has(statusParam as DraftStatus)
          ? (statusParam as DraftStatus)
          : "pending_approval";
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows = await drafts.listWithContext(brandId, { status, limit });
    res.status(200).json({ ok: true, drafts: rows });
  } catch (err) {
    logger.error({ err }, "drafts list failed");
    res.status(500).json({ error: "internal error" });
  }
}
