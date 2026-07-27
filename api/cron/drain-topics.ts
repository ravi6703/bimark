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
 * ONE generation per run. Each is tens of seconds against a 60s function cap,
 * so draining two serially would see the second killed mid-flight — and a
 * killed function runs no catch block, so that topic would be stranded in
 * `drafting` rather than released. At every 10 minutes this still clears six
 * an hour, which is ample for a safety net.
 *
 * The claim in topics.claimForDrafting keeps concurrent runs (and a returning
 * browser) from double-generating the same topic.
 */
const BATCH = 1;
/** Grace period so this never races the dashboard's own generate calls. */
const MIN_AGE_MINUTES = 5;
/**
 * How long a topic may sit in `drafting` before it's presumed dead. Must
 * comfortably exceed the 60s function cap: releasing a healthy in-flight topic
 * would let a second worker claim it and generate the same draft twice.
 */
const STALLED_AFTER_MINUTES = 10;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!assertCronAuthorized(req, res)) return;
  try {
    // Recover anything a killed function left mid-generation before looking
    // for new work — those topics are invisible to the sweep below, which
    // only sees `picked`.
    const recovered = await topics.releaseStalledDrafting(STALLED_AFTER_MINUTES);
    if (recovered > 0) {
      logger.warn({ recovered }, "cron: released topics stalled in drafting");
    }

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
    res.status(200).json({ ok: true, recovered, drained: results.length, results });
  } catch (err) {
    logger.error({ err }, "cron: drain-topics failed");
    res.status(500).json({ error: "internal error" });
  }
}
