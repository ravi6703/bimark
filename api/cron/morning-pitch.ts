import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertCronAuthorized } from "../_lib/cronAuth.js";
import { logger } from "../../src/logger.js";
import { brands } from "../../src/db/repositories/index.js";
import { runMorningPitch } from "../../src/workflows/wf1_morningPitch.js";

/**
 * WF-1 · Morning Pitch, invoked by a Vercel Cron Job (see vercel.json).
 * Runs for every brand workspace (multi-brand support), independently —
 * one brand's failure (e.g. no owned material ingested yet) doesn't stop the
 * others from getting their pitch.
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
          const { group, topicA, topicB } = await runMorningPitch(brand.id);
          return { brand: brand.slug, ok: true, group, topicA: topicA.id, topicB: topicB.id };
        } catch (err) {
          logger.error({ err, brandId: brand.id }, "cron: morning-pitch failed for brand");
          return { brand: brand.slug, ok: false, error: err instanceof Error ? err.message : "failed" };
        }
      }),
    );
    res.status(200).json({ ok: true, results });
  } catch (err) {
    logger.error({ err }, "cron: morning-pitch failed");
    res.status(500).json({ error: "internal error" });
  }
}
