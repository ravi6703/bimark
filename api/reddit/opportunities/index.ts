import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../_lib/requireAuth.js";
import { resolveBrandId } from "../../_lib/brand.js";
import { logger } from "../../../src/logger.js";
import { redditOpportunities } from "../../../src/db/repositories/index.js";

/**
 * GET /api/reddit/opportunities — real Reddit threads found for this brand's
 * search terms (Okara-comparison follow-up), most recent first. Draft-only:
 * nothing here has been or will be auto-posted.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  try {
    const brandId = await resolveBrandId(req);
    const opportunities = await redditOpportunities.list(brandId);
    res.status(200).json({ ok: true, opportunities });
  } catch (err) {
    logger.error({ err }, "reddit opportunities list failed");
    res.status(500).json({ error: "internal error" });
  }
}
