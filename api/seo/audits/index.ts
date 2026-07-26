import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../_lib/requireAuth.js";
import { resolveBrandId } from "../../_lib/brand.js";
import { logger } from "../../../src/logger.js";
import { brands, seoAudits } from "../../../src/db/repositories/index.js";

/**
 * GET /api/seo/audits — the selected brand's real technical SEO audit
 * history (Okara-comparison follow-up), most recent first, plus the
 * brand's configured site_url (or null if none has been set yet).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  try {
    const brandId = await resolveBrandId(req);
    const [brand, audits] = await Promise.all([brands.get(brandId), seoAudits.listRecent(brandId)]);
    res.status(200).json({ ok: true, siteUrl: brand?.site_url ?? null, audits });
  } catch (err) {
    logger.error({ err }, "seo audits list failed");
    res.status(500).json({ error: "internal error" });
  }
}
