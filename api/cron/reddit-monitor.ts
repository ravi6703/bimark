import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertCronAuthorized } from "../_lib/cronAuth.js";
import { logger } from "../../src/logger.js";
import { brands } from "../../src/db/repositories/index.js";
import { runRedditMonitor } from "../../src/workflows/wf10_redditMonitor.js";

/**
 * WF-10 · Reddit thread discovery, invoked weekly by a Vercel Cron Job. Runs
 * for every brand workspace against its own search terms (multi-brand
 * support) — see src/workflows/wf10_redditMonitor.ts.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!assertCronAuthorized(req, res)) return;
  try {
    const all = await brands.listAll();
    const results = await Promise.all(
      all.map(async (brand) => {
        try {
          const r = await runRedditMonitor(brand.id);
          return { brand: brand.slug, ok: true, ...r };
        } catch (err) {
          logger.error({ err, brandId: brand.id }, "cron: reddit-monitor failed for brand");
          return { brand: brand.slug, ok: false, error: err instanceof Error ? err.message : "failed" };
        }
      }),
    );
    res.status(200).json({ ok: true, results });
  } catch (err) {
    logger.error({ err }, "cron: reddit-monitor failed");
    res.status(500).json({ error: "internal error" });
  }
}
