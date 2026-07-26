import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { redactBrandCredentials, resolveBrandId } from "../_lib/brand.js";
import { logger } from "../../src/logger.js";
import { brands } from "../../src/db/repositories/index.js";

/**
 * GET /api/brand — the selected brand's voice guide + banned topics
 * (multi-brand support: which brand is "selected" comes from resolveBrandId,
 * i.e. the dashboard's brand switcher).
 * PATCH /api/brand { voice_guide?, visual_notes?, banned_topics?,
 * ayrshare_api_key?, ayrshare_profile_key?, site_url? } — edit them (audit
 * Phase 1: this was read-only, requiring a DB edit to change).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;

  if (req.method === "PATCH") {
    try {
      const brandId = await resolveBrandId(req);
      const brand = await brands.update(brandId, {
        voice_guide: typeof req.body?.voice_guide === "string" ? req.body.voice_guide : undefined,
        visual_notes: typeof req.body?.visual_notes === "string" ? req.body.visual_notes : undefined,
        banned_topics: Array.isArray(req.body?.banned_topics) ? req.body.banned_topics : undefined,
        ayrshare_api_key:
          typeof req.body?.ayrshare_api_key === "string" ? req.body.ayrshare_api_key.trim() : undefined,
        ayrshare_profile_key:
          typeof req.body?.ayrshare_profile_key === "string"
            ? req.body.ayrshare_profile_key.trim()
            : undefined,
        site_url: typeof req.body?.site_url === "string" ? req.body.site_url.trim() : undefined,
      });
      if (!brand) {
        res.status(404).json({ error: "no brand configured" });
        return;
      }
      res.status(200).json({ ok: true, brand: redactBrandCredentials(brand) });
    } catch (err) {
      logger.error({ err }, "brand update failed");
      res.status(500).json({ error: "internal error" });
    }
    return;
  }

  try {
    const brandId = await resolveBrandId(req);
    const brand = await brands.get(brandId);
    if (!brand) {
      res.status(404).json({ error: "no brand configured" });
      return;
    }
    res.status(200).json({ ok: true, brand: redactBrandCredentials(brand) });
  } catch (err) {
    logger.error({ err }, "brand fetch failed");
    res.status(500).json({ error: "internal error" });
  }
}
