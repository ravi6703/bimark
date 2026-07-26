import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertCronAuthorized } from "../_lib/cronAuth.js";
import { logger } from "../../src/logger.js";
import { brands } from "../../src/db/repositories/index.js";
import { runSovSnapshot } from "../../src/workflows/wf7_sovMemo.js";

/**
 * WF-7a · SOV snapshot (§19), invoked weekly by a Vercel Cron Job. Runs for
 * every brand workspace (multi-brand support), each against its own
 * default_competitors — every brand competes with a different set of
 * companies, so there's no one global list to score against.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!assertCronAuthorized(req, res)) return;
  try {
    const all = await brands.listAll();
    if (all.length === 0) {
      res.status(400).json({ error: "no brand configured — run the seed script" });
      return;
    }
    const results = await Promise.all(
      all.map(async (brand) => {
        try {
          await runSovSnapshot(brand.id, brand.name, brand.default_competitors ?? undefined);
          return { brand: brand.slug, ok: true };
        } catch (err) {
          logger.error({ err, brandId: brand.id }, "cron: sov failed for brand");
          return { brand: brand.slug, ok: false, error: err instanceof Error ? err.message : "failed" };
        }
      }),
    );
    res.status(200).json({ ok: true, results });
  } catch (err) {
    logger.error({ err }, "cron: sov failed");
    res.status(500).json({ error: "internal error" });
  }
}
