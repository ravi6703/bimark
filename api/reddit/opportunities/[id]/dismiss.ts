import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../../_lib/requireAuth.js";
import { resolveBrandId } from "../../../_lib/brand.js";
import { logger } from "../../../../src/logger.js";
import { redditOpportunities } from "../../../../src/db/repositories/index.js";

/** POST /api/reddit/opportunities/:id/dismiss — hide an irrelevant thread. */
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
    const updated = await redditOpportunities.setStatus(id, brandId, "dismissed");
    if (!updated) {
      res.status(404).json({ error: "opportunity not found" });
      return;
    }
    res.status(200).json({ ok: true, opportunity: updated });
  } catch (err) {
    logger.error({ err, id }, "reddit dismiss failed");
    res.status(500).json({ error: "internal error" });
  }
}
