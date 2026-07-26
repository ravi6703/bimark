import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertCronAuthorized } from "../_lib/cronAuth.js";
import { logger } from "../../src/logger.js";
import { brands } from "../../src/db/repositories/index.js";
import { DEFAULT_COMPETITORS } from "../../src/workflows/wf7_sovMemo.js";
import { runCompetitorMonitor } from "../../src/workflows/wf8_competitorMonitor.js";

/**
 * WF-8 · Competitor news-mention monitor, invoked weekly by a Vercel Cron Job.
 * Runs for every brand workspace, each against its own tracked competitor set
 * (multi-brand support) — see src/workflows/wf8_competitorMonitor.ts.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!assertCronAuthorized(req, res)) return;
  try {
    const all = await brands.listAll();
    const results = await Promise.all(
      all.map(async (brand) => {
        try {
          const tracked = brand.default_competitors?.length ? brand.default_competitors : DEFAULT_COMPETITORS;
          const r = await runCompetitorMonitor(brand.id, tracked);
          return { brand: brand.slug, ok: true, ...r };
        } catch (err) {
          logger.error({ err, brandId: brand.id }, "cron: competitor-monitor failed for brand");
          return { brand: brand.slug, ok: false, error: err instanceof Error ? err.message : "failed" };
        }
      }),
    );
    res.status(200).json({ ok: true, results });
  } catch (err) {
    logger.error({ err }, "cron: competitor-monitor failed");
    res.status(500).json({ error: "internal error" });
  }
}
