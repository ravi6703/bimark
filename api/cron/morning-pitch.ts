import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertCronAuthorized } from "../_lib/cronAuth.js";
import { logger } from "../../src/logger.js";
import { brands } from "../../src/db/repositories/index.js";
import { runMorningPitch } from "../../src/workflows/wf1_morningPitch.js";

/** WF-1 · Morning Pitch, invoked by a Vercel Cron Job (see vercel.json). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!assertCronAuthorized(req, res)) return;
  try {
    const brand = await brands.first();
    if (!brand) {
      res.status(400).json({ error: "no brand configured — run the seed script" });
      return;
    }
    const { group, topicA, topicB } = await runMorningPitch(brand.id);
    res.status(200).json({ ok: true, group, topicA: topicA.id, topicB: topicB.id });
  } catch (err) {
    logger.error({ err }, "cron: morning-pitch failed");
    res.status(500).json({ error: "internal error" });
  }
}
