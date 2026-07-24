import { logger } from "../logger.js";
import { topics } from "../db/repositories/index.js";
import type { ParsedCallback } from "../telegram/messages.js";
import { runMorningPitch } from "./wf1_morningPitch.js";
import { runRepurposeReview } from "./wf4_repurposeReview.js";

/**
 * WF-2 · Pitch Callback Handler (§16, webhook). Routes the morning-pitch button:
 *   pickA/pickB → mark chosen `picked`, the sibling `skipped`, kick off WF-4.
 *   more        → regenerate (re-run WF-1) for the same brand.
 *   skip        → mark both `skipped` (feeds the §18 memo).
 */
export interface PitchCallbackResult {
  action: ParsedCallback["action"];
  draftId?: number;
  regenerated?: boolean;
}

export async function handlePitchCallback(
  cb: ParsedCallback,
  brandId: number,
): Promise<PitchCallbackResult> {
  switch (cb.action) {
    case "pickA":
    case "pickB": {
      const topicId = Number(cb.id);
      const topic = await topics.get(topicId);
      if (!topic) throw new Error(`WF-2: topic ${topicId} not found`);

      // Pick this one; skip its sibling(s) from the same pitch group.
      if (topic.pitch_group) await topics.setStatusForGroup(topic.pitch_group, "skipped");
      await topics.setStatus(topicId, "picked");

      const draft = await runRepurposeReview(topicId);
      logger.info({ topicId, draftId: draft.id }, "WF-2: pick → draft");
      return { action: cb.action, draftId: draft.id };
    }
    case "more": {
      await topics.setStatusForGroup(cb.id, "skipped");
      await runMorningPitch(brandId);
      return { action: cb.action, regenerated: true };
    }
    case "skip": {
      await topics.setStatusForGroup(cb.id, "skipped");
      logger.info({ group: cb.id }, "WF-2: skipped both (feeds editorial memo)");
      return { action: cb.action };
    }
    default:
      throw new Error(`WF-2: unexpected action ${cb.action}`);
  }
}
