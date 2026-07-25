import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { logger } from "../../src/logger.js";
import { brands } from "../../src/db/repositories/index.js";

/** GET /api/brand — the default brand's voice guide + banned topics. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
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
