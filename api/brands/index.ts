import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { logger } from "../../src/logger.js";
import { brands } from "../../src/db/repositories/index.js";

/**
 * GET /api/brands — every brand workspace (multi-brand support), for the
 * dashboard's brand switcher. Unlike /api/brand (singular), this always
 * returns every brand regardless of which one is currently selected.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  try {
    const rows = await brands.listAll();
    res.status(200).json({ ok: true, brands: rows });
  } catch (err) {
    logger.error({ err }, "brands list failed");
    res.status(500).json({ error: "internal error" });
  }
}
