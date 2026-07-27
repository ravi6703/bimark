import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { resolveBrandId } from "../_lib/brand.js";
import { logger } from "../../src/logger.js";
import { brands } from "../../src/db/repositories/index.js";
import { assessBrand } from "../../src/brand/readiness.js";

/**
 * GET /api/brands/readiness — is this brand actually set up to produce
 * grounded drafts (Move 6)?
 *
 * ?all=true returns every brand, which is what the portfolio view needs to
 * stop presenting four brands as equal when three of them have no source
 * material. The single-brand form is what the intake form calls, so the
 * warning arrives before the work rather than at review.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  try {
    if (req.query.all === "true") {
      const all = await brands.listAll();
      const readiness = await Promise.all(all.map((b) => assessBrand(b)));
      res.status(200).json({ ok: true, readiness });
      return;
    }
    const brandId = await resolveBrandId(req);
    const brand = await brands.get(brandId);
    if (!brand) {
      res.status(404).json({ error: "brand not found" });
      return;
    }
    res.status(200).json({ ok: true, readiness: await assessBrand(brand) });
  } catch (err) {
    logger.error({ err }, "brand readiness failed");
    res.status(500).json({ error: "internal error" });
  }
}
