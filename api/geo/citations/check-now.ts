import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../_lib/requireAuth.js";
import { resolveBrandId } from "../../_lib/brand.js";
import { logger } from "../../../src/logger.js";
import { brands } from "../../../src/db/repositories/index.js";
import { runGeoCitationCheck } from "../../../src/workflows/wf9_geoCitationCheck.js";

/**
 * POST /api/geo/citations/check-now — manual "check citation now" for the
 * selected brand (the same check the weekly cron runs), same immediacy as
 * the competitor "check for new mentions" button.
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
    const result = await runGeoCitationCheck(brandId, brand.name);
    res.status(200).json({ ok: true, checked: result.checked });
  } catch (err) {
    logger.error({ err }, "geo citation manual check failed");
    res.status(500).json({ error: "internal error" });
  }
}
