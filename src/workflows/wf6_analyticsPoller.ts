import { logger } from "../logger.js";
import { metrics, posts } from "../db/repositories/index.js";
import { getPublisher } from "../publish/index.js";

/**
 * WF-6 · Analytics Poller (§16, scheduled, velocity window §7.1). Every ~30 min,
 * poll metrics for posts still inside their polling window, tapering by age so
 * old posts are polled less often. Writes a `metrics` timeseries row per poll.
 */
export async function runAnalyticsPoller(now = new Date()): Promise<{ polled: number }> {
  const active = await posts.withinPollingWindow(now);
  const publisher = getPublisher();
  let polled = 0;

  for (const post of active) {
    if (!post.external_id) continue;
    if (!shouldPoll(post.published_at ?? post.scheduled_at ?? now, now)) continue;

    const m = await publisher.fetchMetrics(post.external_id);
    if (!m) continue;

    await metrics.insert({ post_id: post.id, ...m });
    polled++;
  }

  logger.info({ candidates: active.length, polled }, "WF-6: analytics poll complete");
  return { polled };
}

/**
 * Taper (§16 WF-6.4 Function node): dense early (velocity matters most in the
 * first hours), sparse later. Poll every 30m for the first 6h, hourly to 24h,
 * every 6h afterwards. With a 30-min cron, we gate by age buckets.
 */
export function shouldPoll(publishedAt: Date, now: Date): boolean {
  const ageMin = (now.getTime() - publishedAt.getTime()) / 60000;
  if (ageMin < 0) return false; // scheduled, not yet live
  if (ageMin <= 6 * 60) return true; // every tick
  const ageHours = ageMin / 60;
  if (ageHours <= 24) return Math.floor(now.getMinutes()) < 30; // ~hourly
  return now.getHours() % 6 === 0 && now.getMinutes() < 30; // every 6h
}
