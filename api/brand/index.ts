import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { logger } from "../../src/logger.js";
import { brands } from "../../src/db/repositories/index.js";

/**
 * GET /api/brand — the default brand's voice guide + banned topics.
 * PATCH /api/brand { voice_guide?, visual_notes?, banned_topics? } — edit them
 * (audit Phase 1: this was read-only, requiring a DB edit to change).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;

  if (req.method === "PATCH") {
    try {
      const current = await brands.first();
      if (!current) {
        res.status(404).json({ error: "no brand configured" });
        return;
      }
      const brand = await brands.update(current.id, {
        voice_guide: typeof req.body?.voice_guide === "string" ? req.body.voice_guide : undefined,
        visual_notes: typeof req.body?.visual_notes === "string" ? req.body.visual_notes : undefined,
        banned_topics: Array.isArray(req.body?.banned_topics) ? req.body.banned_topics : undefined,
      });
      res.status(200).json({ ok: true, brand });
    } catch (err) {
      logger.error({ err }, "brand update failed");
      res.status(500).json({ error: "internal error" });
    }
    return;
  }

  try {
    const brand = await brands.first();
    if (!brand) {
      res.status(404).json({ error: "no brand configured" });
      return;
    }
    res.status(200).json({ ok: true, brand });
  } catch (err) {
    logger.error({ err }, "brand fetch failed");
    res.status(500).json({ error: "internal error" });
  }
}
