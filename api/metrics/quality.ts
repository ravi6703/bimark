import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { resolveBrandId } from "../_lib/brand.js";
import { config } from "../../src/config.js";
import { approvals, posts } from "../../src/db/repositories/index.js";

/**
 * §7 operational metric: first-pass approval rate + mean edit distance, plus
 * (audit Phase 1) the PRD's own cadence target — previously asserted in the
 * README ("2-4 posts a week") but never instrumented anywhere in the product.
 * Scoped to the selected brand (multi-brand support) — otherwise these numbers
 * blend every brand's activity together.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (!config.db.enabled) {
    res.status(503).json({ error: "DATABASE_URL not configured" });
    return;
  }
  const brandId = await resolveBrandId(req);
  const stats = await approvals.qualityStats(brandId);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const postsLast7Days = await posts.countPublishedSince(brandId, sevenDaysAgo);
  res.status(200).json({
    ...stats,
    target: config.quality.firstPassApprovalTarget,
    postsLast7Days,
    postsPerWeekMin: config.quality.postsPerWeekMin,
    postsPerWeekMax: config.quality.postsPerWeekMax,
  });
}
