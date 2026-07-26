import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { resolveBrandId } from "../_lib/brand.js";
import { logger } from "../../src/logger.js";
import { topics } from "../../src/db/repositories/index.js";
import type { TopicStatus } from "../../src/types.js";

const VALID_STATUSES = new Set<TopicStatus>([
  "suggested",
  "picked",
  "skipped",
  "drafting",
  "drafted",
  "archived",
]);

/** GET /api/topics?status=&limit= — dashboard topic list. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  try {
    const brandId = await resolveBrandId(req);
    const statusParam = typeof req.query.status === "string" ? req.query.status : undefined;
    const status =
      statusParam && VALID_STATUSES.has(statusParam as TopicStatus)
        ? (statusParam as TopicStatus)
        : undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows = await topics.list(brandId, { status, limit });
    res.status(200).json({ ok: true, topics: rows });
  } catch (err) {
    logger.error({ err }, "topics list failed");
    res.status(500).json({ error: "internal error" });
  }
}
