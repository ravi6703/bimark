import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { logger } from "../../src/logger.js";
import { resolveBrandId } from "../_lib/brand.js";
import { handleManualIntake } from "../../src/workflows/wf3_manualIntake.js";

/**
 * WF-3 · Manual Intake (§16, webhook). Point the shared board's (Airtable/
 * Notion) row-saved automation, or the frontend form, at this URL.
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
    const results = await handleManualIntake(body);
    res.status(200).json({
      ok: true,
      results: results.map((r) => ({ platform: r.platform, topicId: r.topicId, draftId: r.draft.id })),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.issues });
      return;
    }
    logger.error({ err }, "manual-intake failed");
    res.status(500).json({ error: "internal error" });
  }
}
