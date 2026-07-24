import cron from "node-cron";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { brands } from "./db/repositories/index.js";
import { ingestDir } from "./rag/ingest.js";
import { runMorningPitch } from "./workflows/wf1_morningPitch.js";
import { runAnalyticsPoller } from "./workflows/wf6_analyticsPoller.js";
import { runEditorialMemo, runSovSnapshot } from "./workflows/wf7_sovMemo.js";

/**
 * Cron scheduler (§16). Registers the four scheduled workflows. Each task
 * resolves the default brand and swallows/logs errors so one failure never
 * kills the scheduler.
 */
export function startScheduler(): cron.ScheduledTask[] {
  const tz = config.tz;
  const tasks: cron.ScheduledTask[] = [];
  const guard = (name: string, fn: () => Promise<unknown>) => async () => {
    try {
      await fn();
    } catch (err) {
      logger.error({ err, task: name }, "scheduled task failed");
    }
  };

  // WF-1 · Morning pitch (08:00 IST default).
  tasks.push(
    cron.schedule(
      config.cron.morningPitch,
      guard("morning-pitch", async () => {
        const b = await brands.first();
        if (b) await runMorningPitch(b.id);
      }),
      { timezone: tz },
    ),
  );

  // WF-6 · Analytics poller (every 30m).
  tasks.push(
    cron.schedule(config.cron.analyticsPoll, guard("analytics-poll", () => runAnalyticsPoller()), {
      timezone: tz,
    }),
  );

  // WF-7a · SOV snapshot (weekly).
  tasks.push(
    cron.schedule(
      config.cron.sov,
      guard("sov", async () => {
        const b = await brands.first();
        if (b) await runSovSnapshot(b.id, b.name);
      }),
      { timezone: tz },
    ),
  );

  // WF-7b · Editorial memo (monthly).
  tasks.push(
    cron.schedule(
      config.cron.editorialMemo,
      guard("editorial-memo", async () => {
        const b = await brands.first();
        if (b) await runEditorialMemo(b.id, currentPeriod());
      }),
      { timezone: tz },
    ),
  );

  // §18.6 · Nightly ingestion refresh (from INGEST_DIR if set).
  if (process.env.INGEST_DIR) {
    tasks.push(
      cron.schedule(
        config.cron.ingestRefresh,
        guard("ingest-refresh", async () => {
          const b = await brands.first();
          if (b) await ingestDir(b.id, process.env.INGEST_DIR!);
        }),
        { timezone: tz },
      ),
    );
  }

  logger.info({ tasks: tasks.length, tz }, "scheduler started");
  return tasks;
}

/** Previous-ish month bucket in YYYY-MM (memo runs on the 1st, for the month just past). */
export function currentPeriod(now = new Date()): string {
  const d = new Date(now.getTime());
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
