import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertCronAuthorized } from "../_lib/cronAuth.js";
import { logger } from "../../src/logger.js";
import { brands } from "../../src/db/repositories/index.js";
import { runEditorialMemo } from "../../src/workflows/wf7_sovMemo.js";
import { currentPeriod } from "../../src/util/period.js";

/** WF-7b · Editorial memo (§11), invoked monthly by a Vercel Cron Job. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!assertCronAuthorized(req, res)) return;
  try {
    const brand = await brands.first();
    if (!brand) {
      res.status(400).json({ error: "no brand configured — run the seed script" });
      return;
    }
    const period = currentPeriod();
    const memo = await runEditorialMemo(brand.id, period);
    res.status(200).json({ ok: true, period, memo });
  } catch (err) {
    logger.error({ err }, "cron: editorial-memo failed");
    res.status(500).json({ error: "internal error" });
  }
}
