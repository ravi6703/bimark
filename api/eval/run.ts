import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { resolveBrandId } from "../_lib/brand.js";
import { logger } from "../../src/logger.js";
import { runEval } from "../../src/eval/goldenSet.js";

/**
 * POST /api/eval/run — replay the golden set against today's prompts (Move 5).
 *
 * Each case is a real generation call, and the function budget is 60s. Three
 * per request fits comfortably; the response reports `remaining` so the caller
 * can run it again rather than having the batch silently truncated. That
 * "no silent caps" behaviour matters here more than usual — an eval that
 * quietly skipped half its cases would report a confidently wrong mean.
 */
const CASES_PER_REQUEST = 3;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const me = requireAuth(req, res);
  if (!me) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  try {
    const brandId = await resolveBrandId(req);
    const result = await runEval(brandId, me.name, CASES_PER_REQUEST);
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, "eval run failed");
    res.status(500).json({ error: "internal error" });
  }
}
