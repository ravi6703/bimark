import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../_lib/requireAuth.js";
import { resolveBrandId } from "../../_lib/brand.js";
import { logger } from "../../../src/logger.js";
import { redditSearchTerms } from "../../../src/db/repositories/index.js";

/**
 * GET /api/reddit/search-terms — this brand's real Reddit search terms
 * (Okara-comparison follow-up), manual like competitor tracking.
 * POST /api/reddit/search-terms { term, subreddit? } — add one.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;

  if (req.method === "GET") {
    try {
      const brandId = await resolveBrandId(req);
      const terms = await redditSearchTerms.list(brandId);
      res.status(200).json({ ok: true, terms });
    } catch (err) {
      logger.error({ err }, "reddit search-terms list failed");
      res.status(500).json({ error: "internal error" });
    }
    return;
  }

  if (req.method === "POST") {
    const term = typeof req.body?.term === "string" ? req.body.term.trim() : "";
    if (!term) {
      res.status(400).json({ error: "term is required" });
      return;
    }
    const subreddit = typeof req.body?.subreddit === "string" ? req.body.subreddit.trim() || null : null;
    try {
      const brandId = await resolveBrandId(req);
      const created = await redditSearchTerms.create({ brand_id: brandId, term, subreddit });
      res.status(200).json({ ok: true, term: created });
    } catch (err) {
      logger.error({ err }, "reddit search-term create failed");
      res.status(500).json({ error: "internal error" });
    }
    return;
  }

  res.status(405).json({ error: "method not allowed" });
}
