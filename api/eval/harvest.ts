import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { resolveBrandId } from "../_lib/brand.js";
import { logger } from "../../src/logger.js";
import { harvestCases } from "../../src/eval/goldenSet.js";

/**
 * POST /api/eval/harvest — freeze new golden-set cases (Move 5).
 *
 * Reads only; no generation, so this is fast and free. Every draft a human
 * approved *with edits* becomes a labelled AI-vs-human example. Idempotent —
 * re-running only ever adds what's new.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const me = requireAuth(req, res);
  if (!me) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  try {
    const brandId = await resolveBrandId(req);
    const result = await harvestCases(brandId, me.name);
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, "eval harvest failed");
    res.status(500).json({ error: "internal error" });
  }
}
