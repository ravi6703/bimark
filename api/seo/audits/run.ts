import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../_lib/requireAuth.js";
import { resolveBrandId } from "../../_lib/brand.js";
import { logger } from "../../../src/logger.js";
import { brands, seoAudits } from "../../../src/db/repositories/index.js";
import { runSeoAudit } from "../../../src/seo/audit.js";

/**
 * POST /api/seo/audits/run { url? } — runs a fresh technical SEO audit right
 * now. Uses the given url, or falls back to the brand's configured
 * site_url. Genuinely fetches the live site — not a cached/estimated result.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  try {
    const brandId = await resolveBrandId(req);
    const explicitUrl = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    const brand = await brands.get(brandId);
    const url = explicitUrl || brand?.site_url || "";
    if (!url) {
      res.status(400).json({ error: "No site URL — pass one, or set it in Pillars & brand first." });
      return;
    }
    const result = await runSeoAudit(url);
    const audit = await seoAudits.create({ brand_id: brandId, ...result });
    res.status(200).json({ ok: true, audit });
  } catch (err) {
    logger.error({ err }, "seo audit run failed");
    res.status(400).json({ error: err instanceof Error ? err.message : "audit failed" });
  }
}
