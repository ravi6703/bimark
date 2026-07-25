import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { resolveBrandId } from "../_lib/brand.js";
import { logger } from "../../src/logger.js";
import { insights } from "../../src/db/repositories/index.js";
import { isSovConfigured } from "../../src/workflows/wf7_sovMemo.js";

/**
 * GET /api/insights — the monthly editorial memo (WF-7b), previously reached
 * only via Telegram (audit Phase 1). Also reports whether SOV tracking is
 * actually wired up, so the dashboard can be honest about it instead of
 * quoting a bare 0% as if it were competitive data.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  try {
    const brandId = await resolveBrandId();
    const rows = await insights.list(brandId);
    res.status(200).json({ ok: true, insights: rows, sovConfigured: isSovConfigured() });
  } catch (err) {
    logger.error({ err }, "insights list failed");
    res.status(500).json({ error: "internal error" });
  }
}
