import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../_lib/requireAuth.js";
import { resolveBrandId } from "../../_lib/brand.js";
import { logger } from "../../../src/logger.js";
import { runRedditMonitor } from "../../../src/workflows/wf10_redditMonitor.js";

/**
 * POST /api/reddit/opportunities/check-now — manual "find new threads now"
 * for the selected brand, same immediacy as the competitor/GEO check-now
 * buttons.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  try {
    const brandId = await resolveBrandId(req);
    const result = await runRedditMonitor(brandId);
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, "reddit manual check failed");
    res.status(500).json({ error: "internal error" });
  }
}
