import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { logger } from "../../src/logger.js";
import { resolveBrandId } from "../_lib/brand.js";
import { queueManualIntake } from "../../src/workflows/wf3_manualIntake.js";

/**
 * WF-3 · Manual Intake (§16, webhook). Point the shared board's (Airtable/
 * Notion) row-saved automation, or the frontend form, at this URL.
 *
 * Queues one topic per target platform and returns 202 immediately — it does
 * NOT wait for drafts. Generating N platforms inline used to exceed the 60s
 * function cap (see queueManualIntake); callers now generate each queued
 * topic via POST /api/topics/generate, and the drain cron picks up whatever
 * they don't. Poll GET /api/drafts for the results.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  try {
    // The dashboard's New Topic form sends x-brand-id for whichever brand is
    // selected (multi-brand support) — override the body's brand_id with
    // that instead of trusting a hardcoded value from an older client.
    // External automations (Airtable/Notion) with no such header keep
    // specifying brand_id in the body directly, unchanged.
    const body = req.headers["x-brand-id"]
      ? { ...req.body, brand_id: await resolveBrandId(req) }
      : req.body;
    const { campaignId, queued } = await queueManualIntake(body);
    res.status(202).json({ ok: true, campaignId, queued });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.issues });
      return;
    }
    logger.error({ err }, "manual-intake failed");
    res.status(500).json({ error: "internal error" });
  }
}
