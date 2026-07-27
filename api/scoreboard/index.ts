import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { resolveBrandId } from "../_lib/brand.js";
import { logger } from "../../src/logger.js";
import { buildScoreboard } from "../../src/scoreboard/index.js";

/**
 * GET /api/scoreboard — the four numbers leadership reads (Move 2).
 *
 * Cadence, queue health, hours saved, and attributable inbound. Every value is
 * either measured or explicitly marked unconfigured; nothing is estimated on
 * the platform's behalf.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  try {
    const brandId = await resolveBrandId(req);
    res.status(200).json({ ok: true, scoreboard: await buildScoreboard(brandId) });
  } catch (err) {
    logger.error({ err }, "scoreboard failed");
    res.status(500).json({ error: "internal error" });
  }
}
