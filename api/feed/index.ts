import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { resolveBrandId } from "../_lib/brand.js";
import { logger } from "../../src/logger.js";
import { buildFeed } from "../../src/feed/index.js";

/**
 * GET /api/feed — one time-ordered stream of what the agents found and
 * drafted, replacing "remember to check six dashboards". See src/feed.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  try {
    const brandId = await resolveBrandId(req);
    res.status(200).json({ ok: true, items: await buildFeed(brandId) });
  } catch (err) {
    logger.error({ err }, "feed build failed");
    res.status(500).json({ error: "internal error" });
  }
}
