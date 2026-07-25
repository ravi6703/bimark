import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { resolveBrandId } from "../_lib/brand.js";
import { logger } from "../../src/logger.js";
import { pillars } from "../../src/db/repositories/index.js";

/** GET /api/pillars — active pillars for the default brand (§12.1). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  try {
    const brandId = await resolveBrandId();
    const rows = await pillars.listActive(brandId);
    res.status(200).json({ ok: true, pillars: rows });
  } catch (err) {
    logger.error({ err }, "pillars list failed");
    res.status(500).json({ error: "internal error" });
  }
}
