import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertCronAuthorized } from "../_lib/cronAuth.js";
import { logger } from "../../src/logger.js";
import { topics } from "../../src/db/repositories/index.js";
import {
  runRepurposeReview,
  TopicAlreadyGeneratingError,
} from "../../src/workflows/wf4_repurposeReview.js";

/**
 * Drain queued-but-never-generated topics (WF-3 async intake safety net).
 *
 * Intake queues a topic per platform and the dashboard generates each one; if
 * the operator closes the tab mid-run, or a generate request fails, those
 * topics would sit in `picked` forever. This sweeps them up.
 *
 * Deliberately small per run: each generation is tens of seconds and the
 * function cap is 60s, so it takes BATCH per run and lets the next run
 * continue — the claim in topics.claimForDrafting keeps concurrent runs (and
 * a returning browser) from double-generating the same topic.
 */
const BATCH = 2;
/** Grace period so this never races the dashboard's own generate calls. */
const MIN_AGE_MINUTES = 5;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!assertCronAuthorized(req, res)) return;
  try {
    const pending = await topics.listPendingGeneration(MIN_AGE_MINUTES, BATCH);
    const results = [];
    for (const topic of pending) {
      try {
        const draft = await runRepurposeReview(topic.id);
        results.push({ topicId: topic.id, ok: true, draftId: draft.id });
      } catch (err) {
        if (err instanceof TopicAlreadyGeneratingError) continue; // someone beat us to it
        logger.error({ err, topicId: topic.id }, "cron: drain-topics failed for topic");
        results.push({ topicId: topic.id, ok: false });
      }
    }
    if (results.length > 0) {
      logger.info({ drained: results.length }, "cron: drained queued topics");
    }
    res.status(200).json({ ok: true, drained: results.length, results });
  } catch (err) {
    logger.error({ err }, "cron: drain-topics failed");
    res.status(500).json({ error: "internal error" });
  }
}
