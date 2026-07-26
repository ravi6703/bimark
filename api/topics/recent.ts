import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { resolveBrandId } from "../_lib/brand.js";
import { logger } from "../../src/logger.js";
import { drafts, pillars } from "../../src/db/repositories/index.js";

/**
 * GET /api/topics/recent?platform=&pillar= — recent angles already covered
 * for this pillar+platform combo (Okara-inspired follow-up, "show previous
 * data"). Shown in the New Topic form before submitting, and fed into the
 * generation prompt itself (see wf4_repurposeReview.ts) so new drafts don't
 * blindly repeat what's already been said.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  const platform = typeof req.query.platform === "string" ? req.query.platform : "";
  if (!platform) {
    res.status(400).json({ error: "platform required" });
    return;
  }

  try {
    const brandId = await resolveBrandId();
    const pillarName = typeof req.query.pillar === "string" ? req.query.pillar : "";
    let pillarId: number | null = null;
    if (pillarName) {
      const p = await pillars.findByName(brandId, pillarName);
      pillarId = p?.id ?? null;
    }
    const recent = await drafts.listRecentAngles(brandId, platform, pillarId, 5);
    res.status(200).json({ ok: true, recent });
  } catch (err) {
    logger.error({ err }, "recent topics lookup failed");
    res.status(500).json({ error: "internal error" });
  }
}
