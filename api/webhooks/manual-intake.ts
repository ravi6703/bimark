import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { logger } from "../../src/logger.js";
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
    const { topicId, draft } = await handleManualIntake(req.body);
    res.status(200).json({ ok: true, topicId, draftId: draft.id });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.issues });
      return;
    }
    logger.error({ err }, "manual-intake failed");
    res.status(500).json({ error: "internal error" });
  }
}
