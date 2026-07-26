import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertCronAuthorized } from "../_lib/cronAuth.js";
import { logger } from "../../src/logger.js";
import { brands } from "../../src/db/repositories/index.js";
import { runGeoCitationCheck } from "../../src/workflows/wf9_geoCitationCheck.js";

/**
 * WF-9 · GEO citation tracking, invoked weekly by a Vercel Cron Job. Runs for
 * every brand workspace against its own probe questions (multi-brand
 * support) — see src/workflows/wf9_geoCitationCheck.ts.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!assertCronAuthorized(req, res)) return;
  try {
    const all = await brands.listAll();
    const results = await Promise.all(
      all.map(async (brand) => {
        try {
          const r = await runGeoCitationCheck(brand.id, brand.name);
          return { brand: brand.slug, ok: true, checked: r.checked };
        } catch (err) {
          logger.error({ err, brandId: brand.id }, "cron: geo-citation-check failed for brand");
          return { brand: brand.slug, ok: false, error: err instanceof Error ? err.message : "failed" };
        }
      }),
    );
    res.status(200).json({ ok: true, results });
  } catch (err) {
    logger.error({ err }, "cron: geo-citation-check failed");
    res.status(500).json({ error: "internal error" });
  }
}
