import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertCronAuthorized } from "../_lib/cronAuth.js";
import { logger } from "../../src/logger.js";
import { brands } from "../../src/db/repositories/index.js";
import { runEditorialMemo } from "../../src/workflows/wf7_sovMemo.js";
import { currentPeriod } from "../../src/util/period.js";

/**
 * WF-7b · Editorial memo (§11), invoked monthly by a Vercel Cron Job. Runs
 * for every brand workspace (multi-brand support) — each brand's editorial
 * performance is its own story, not one blended memo.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!assertCronAuthorized(req, res)) return;
  try {
    const all = await brands.listAll();
    if (all.length === 0) {
      res.status(400).json({ error: "no brand configured — run the seed script" });
      return;
    }
    const period = currentPeriod();
    const results = await Promise.all(
      all.map(async (brand) => {
        try {
          const memo = await runEditorialMemo(brand.id, period);
          return { brand: brand.slug, ok: true, memo };
        } catch (err) {
          logger.error({ err, brandId: brand.id }, "cron: editorial-memo failed for brand");
          return { brand: brand.slug, ok: false, error: err instanceof Error ? err.message : "failed" };
        }
      }),
    );
    res.status(200).json({ ok: true, period, results });
  } catch (err) {
    logger.error({ err }, "cron: editorial-memo failed");
    res.status(500).json({ error: "internal error" });
  }
}
