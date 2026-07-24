import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertCronAuthorized } from "../_lib/cronAuth.js";
import { logger } from "../../src/logger.js";
import { brands } from "../../src/db/repositories/index.js";
import { runSovSnapshot } from "../../src/workflows/wf7_sovMemo.js";

/** WF-7a · SOV snapshot (§19), invoked weekly by a Vercel Cron Job. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!assertCronAuthorized(req, res)) return;
  try {
    const brand = await brands.first();
    if (!brand) {
      res.status(400).json({ error: "no brand configured — run the seed script" });
      return;
    }
    await runSovSnapshot(brand.id, brand.name);
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error({ err }, "cron: sov failed");
    res.status(500).json({ error: "internal error" });
  }
}
