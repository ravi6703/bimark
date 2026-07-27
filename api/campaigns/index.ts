import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { resolveBrandId } from "../_lib/brand.js";
import { logger } from "../../src/logger.js";
import { campaigns } from "../../src/db/repositories/index.js";

/**
 * GET /api/campaigns — this brand's content ideas, each with the live state of
 * every channel it went out on (migration 015).
 *
 * The replacement for listing raw topics, where one idea targeting five
 * platforms appeared five times with nothing tying the rows together.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  try {
    const brandId = await resolveBrandId(req);
    const list = await campaigns.listWithChannels(brandId);
    res.status(200).json({ ok: true, campaigns: list });
  } catch (err) {
    logger.error({ err }, "campaigns list failed");
    res.status(500).json({ error: "internal error" });
  }
}
