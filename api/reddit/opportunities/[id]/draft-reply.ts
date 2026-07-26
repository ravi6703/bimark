import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../../_lib/requireAuth.js";
import { resolveBrandId } from "../../../_lib/brand.js";
import { logger } from "../../../../src/logger.js";
import { brands, redditOpportunities } from "../../../../src/db/repositories/index.js";
import { draftRedditReply } from "../../../../src/reddit/reply.js";

/**
 * POST /api/reddit/opportunities/:id/draft-reply — generates a suggested
 * reply on demand (not automatically on discovery, to avoid spending an LLM
 * call on every thread found whether the team wants to use it or not).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid opportunity id" });
    return;
  }
  try {
    const brandId = await resolveBrandId(req);
    const [brand, opportunity] = await Promise.all([
      brands.get(brandId),
      redditOpportunities.get(id, brandId),
    ]);
    if (!opportunity) {
      res.status(404).json({ error: "opportunity not found" });
      return;
    }
    const { reply } = await draftRedditReply({
      brandName: brand?.name ?? "the brand",
      voiceGuide: brand?.voice_guide ?? "",
      threadTitle: opportunity.thread_title,
      threadExcerpt: opportunity.thread_excerpt,
      subreddit: opportunity.subreddit,
    });
    const updated = await redditOpportunities.setReply(id, brandId, reply);
    res.status(200).json({ ok: true, opportunity: updated });
  } catch (err) {
    logger.error({ err, id }, "reddit draft-reply failed");
    res.status(500).json({ error: "internal error" });
  }
}
