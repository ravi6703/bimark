import { channels, outcomes, posts, timeBaselines } from "../db/repositories/index.js";
import { query } from "../db/pool.js";

/**
 * Move 2 — the one screen that answers "is this earning its place".
 *
 * Everything here is deliberately boring and deliberately honest. Each number
 * is either a real measurement or an explicit `configured: false`; nothing is
 * estimated on the platform's behalf. That matters more here than anywhere
 * else in the product, because this is the screen leadership will read, and a
 * confidently-wrong number on it is worse than a blank.
 *
 * The four numbers, in the order they should be read:
 *
 *   1. Cadence   — did we publish what we said we would? (measured)
 *   2. Queue     — is review keeping up, and how much does the AI need fixing?
 *                  (measured)
 *   3. Hours     — real post count x the team's own before/after estimate
 *                  (measured x stated; never invented)
 *   4. Inbound   — leads recorded against periods, plus how much of what we
 *                  published is even attributable (measured)
 */

/** Monday-anchored week start, so cadence lines up with channel weekly_target. */
export function weekStart(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // getUTCDay(): 0 = Sunday. Shift so Monday is day 0.
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface CadenceLine {
  platform: string;
  published: number;
  target: number | null;
}

export interface Scoreboard {
  weekStart: string;
  cadence: {
    published: number;
    target: number | null;
    byPlatform: CadenceLine[];
  };
  queue: {
    /** Share of decisions that were a clean approve, no edit needed. */
    firstPassApprovalRate: number | null;
    /** Median hours from draft created to the decision on it. NULL until at
     * least one draft has actually been decided. */
    medianHoursToDecision: number | null;
    awaitingReview: number;
    sample: number;
  };
  hours:
    | { configured: false; reason: string }
    | {
        configured: true;
        postsCounted: number;
        minutesPerPostBefore: number;
        minutesPerPostAfter: number;
        hoursSaved: number;
        capturedAt: Date;
        /** Always true — the multiplier is a human estimate, and every surface
         * that renders this must say so rather than presenting it as measured. */
        estimateBased: true;
      };
  inbound: {
    leads: number;
    signups: number;
    entries: number;
    /** Published posts in the window that carried a stamped own-domain link,
     * over the total published. Low coverage is the honest explanation for a
     * low lead count, so it's reported next to it rather than buried. */
    attributablePosts: number;
    totalPosts: number;
  };
}

/** Days of history the scoreboard summarises for the non-cadence numbers.
 * Long enough that a slow week doesn't read as collapse, short enough that it
 * reflects how the product works now. */
const WINDOW_DAYS = 90;

export async function buildScoreboard(brandId: number, now = new Date()): Promise<Scoreboard> {
  const wk = weekStart(now);
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 86400_000);

  const [chans, publishedByPlatform, weekTotal, baseline, inboundTotals] = await Promise.all([
    channels.list(brandId),
    posts.countPublishedSinceByPlatform(brandId, wk),
    posts.countPublishedSince(brandId, wk),
    timeBaselines.current(brandId),
    outcomes.totalsSince(brandId, isoDate(windowStart)),
  ]);

  const byPlatform: CadenceLine[] = chans.map((c) => ({
    platform: c.platform,
    published: publishedByPlatform[c.platform] ?? 0,
    target: c.weekly_target ?? null,
  }));
  const targets = byPlatform.map((l) => l.target).filter((t): t is number => t != null);

  const [queue, windowPosts] = await Promise.all([
    queueHealth(brandId),
    attributionCoverage(brandId, windowStart),
  ]);

  return {
    weekStart: isoDate(wk),
    cadence: {
      published: weekTotal,
      target: targets.length > 0 ? targets.reduce((a, b) => a + b, 0) : null,
      byPlatform,
    },
    queue,
    hours: baseline
      ? {
          configured: true,
          postsCounted: windowPosts.total,
          minutesPerPostBefore: baseline.minutes_per_post_before,
          minutesPerPostAfter: baseline.minutes_per_post_after,
          hoursSaved:
            Math.round(
              ((windowPosts.total *
                (baseline.minutes_per_post_before - baseline.minutes_per_post_after)) /
                60) *
                10,
            ) / 10,
          capturedAt: baseline.captured_at,
          estimateBased: true,
        }
      : {
          configured: false,
          reason:
            "No time baseline recorded yet. Capture the team's before/after minutes-per-post " +
            "to turn the real published count into an hours-saved figure.",
        },
    inbound: {
      ...inboundTotals,
      attributablePosts: windowPosts.attributable,
      totalPosts: windowPosts.total,
    },
  };
}

/**
 * First-pass approval rate and how long a draft waits for a decision. Both are
 * scoped to the drafts that have actually been decided — a draft still sitting
 * in the queue has no decision latency yet, and counting it as zero would make
 * a backlog look like speed.
 */
async function queueHealth(brandId: number): Promise<Scoreboard["queue"]> {
  const { rows } = await query<{
    approvals: string;
    edits: string;
    rejects: string;
    median_hours: string | null;
  }>(
    `WITH decided AS (
       SELECT DISTINCT ON (a.draft_id)
              a.draft_id, a.action, a.created_at, d.created_at AS drafted_at
         FROM approvals a
         JOIN drafts d ON d.id = a.draft_id
         JOIN topics t ON t.id = d.topic_id
        WHERE t.brand_id = $1 AND a.action IN ('approve','edit','reject')
        ORDER BY a.draft_id, a.created_at ASC
     )
     SELECT count(*) FILTER (WHERE action = 'approve') AS approvals,
            count(*) FILTER (WHERE action = 'edit')    AS edits,
            count(*) FILTER (WHERE action = 'reject')  AS rejects,
            percentile_cont(0.5) WITHIN GROUP (
              ORDER BY EXTRACT(EPOCH FROM (created_at - drafted_at)) / 3600
            ) AS median_hours
       FROM decided`,
    [brandId],
  );
  const r = rows[0];
  const approvalsN = Number(r?.approvals ?? 0);
  const sample = approvalsN + Number(r?.edits ?? 0) + Number(r?.rejects ?? 0);

  const { rows: pending } = await query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM drafts d JOIN topics t ON t.id = d.topic_id
      WHERE t.brand_id = $1 AND d.status = 'pending_approval'`,
    [brandId],
  );

  return {
    firstPassApprovalRate: sample > 0 ? approvalsN / sample : null,
    medianHoursToDecision:
      r?.median_hours == null ? null : Math.round(Number(r.median_hours) * 10) / 10,
    awaitingReview: Number(pending[0]?.n ?? 0),
    sample,
  };
}

/** How much of what we published can be traced at all (Move 1's whole point). */
async function attributionCoverage(
  brandId: number,
  since: Date,
): Promise<{ total: number; attributable: number }> {
  const { rows } = await query<{ total: number; attributable: number }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE po.utm_campaign IS NOT NULL)::int AS attributable
       FROM posts po
       JOIN drafts d ON d.id = po.draft_id
       JOIN topics t ON t.id = d.topic_id
      WHERE t.brand_id = $1 AND po.published_at >= $2`,
    [brandId, since],
  );
  return {
    total: Number(rows[0]?.total ?? 0),
    attributable: Number(rows[0]?.attributable ?? 0),
  };
}
