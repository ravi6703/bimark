import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../_lib/requireAuth.js";
import { resolveBrandId } from "../../_lib/brand.js";
import { logger } from "../../../src/logger.js";
import { redditSearchTerms } from "../../../src/db/repositories/index.js";

/** DELETE /api/reddit/search-terms/:id — remove a search term. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "DELETE") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid term id" });
    return;
  }
  try {
    const brandId = await resolveBrandId(req);
    const deleted = await redditSearchTerms.delete(id, brandId);
    if (!deleted) {
      res.status(404).json({ error: "term not found" });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error({ err, id }, "reddit search-term delete failed");
    res.status(500).json({ error: "internal error" });
  }
}
