import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertCronAuthorized } from "../_lib/cronAuth.js";
import { logger } from "../../src/logger.js";
import { runAnalyticsPoller } from "../../src/workflows/wf6_analyticsPoller.js";

/**
 * WF-6 · Analytics Poller, invoked by a Vercel Cron Job. NOTE: Vercel's Hobby
 * plan limits crons to once/day — the PRD's 30-minute cadence (§7.1) needs a
 * Pro plan or higher. See docs/VERCEL.md.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!assertCronAuthorized(req, res)) return;
  try {
    const { polled } = await runAnalyticsPoller(new Date());
    res.status(200).json({ ok: true, polled });
  } catch (err) {
    logger.error({ err }, "cron: analytics-poll failed");
    res.status(500).json({ error: "internal error" });
  }
}
