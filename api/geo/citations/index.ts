import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../_lib/requireAuth.js";
import { resolveBrandId } from "../../_lib/brand.js";
import { logger } from "../../../src/logger.js";
import { geoCitationChecks } from "../../../src/db/repositories/index.js";
import { isGeoCitationConfigured } from "../../../src/workflows/wf9_geoCitationCheck.js";

/**
 * GET /api/geo/citations — real GEO citation-tracking results for the
 * selected brand (Okara-comparison follow-up): per-engine mention rate over
 * the last 30 days, plus the recent check log. `configured: false` when no
 * engine is set up yet (no ANTHROPIC_API_KEY) — never a synthesized score.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  try {
    const brandId = await resolveBrandId(req);
    const [summary, recent] = await Promise.all([
      geoCitationChecks.summaryByEngine(brandId, 30),
      geoCitationChecks.listRecent(brandId, 50),
    ]);
    res.status(200).json({
      ok: true,
      configured: isGeoCitationConfigured(),
      summary,
      recent,
    });
  } catch (err) {
    logger.error({ err }, "geo citations fetch failed");
    res.status(500).json({ error: "internal error" });
  }
}
