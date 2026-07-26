import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { resolveBrandId } from "../_lib/brand.js";
import { logger } from "../../src/logger.js";
import { brands } from "../../src/db/repositories/index.js";
import { DEFAULT_COMPETITORS } from "../../src/workflows/wf7_sovMemo.js";
import { runCompetitorMonitor } from "../../src/workflows/wf8_competitorMonitor.js";

/**
 * POST /api/competitors/monitor — manual "check for new mentions now" for
 * the selected brand (the same check the weekly cron runs), so the operator
 * doesn't have to wait a week to see it work.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  try {
    const brandId = await resolveBrandId(req);
    const brand = await brands.get(brandId);
    if (!brand) {
      res.status(404).json({ error: "no brand configured" });
      return;
    }
    const tracked = brand.default_competitors?.length ? brand.default_competitors : DEFAULT_COMPETITORS;
    const result = await runCompetitorMonitor(brandId, tracked);
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, "competitor monitor manual run failed");
    res.status(500).json({ error: "internal error" });
  }
}
