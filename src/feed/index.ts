import {
  competitorNotes,
  drafts,
  geoCitationChecks,
  insights,
  redditOpportunities,
  seoAudits,
  topics,
} from "../db/repositories/index.js";
import { platformFor } from "../platforms/index.js";
import { AUTO_MONITOR_AUTHOR } from "../workflows/wf8_competitorMonitor.js";

/** Which tab acting on this item leads to. */
export type FeedTab = "queue" | "campaigns" | "competitors" | "reddit" | "geo" | "seo" | "insights";

export interface FeedItem {
  kind: "draft" | "pitch" | "competitor" | "reddit" | "geo" | "seo" | "memo";
  /** Sort key — when the thing actually happened. */
  at: string;
  title: string;
  detail: string | null;
  /** True when a human still has to do something about it. */
  actionable: boolean;
  tab: FeedTab;
}

const LOOKBACK_DAYS = 14;

/**
 * The agent feed — one stream of what the agents found and drafted, newest
 * first, instead of six dashboards someone has to remember to open.
 *
 * Composed entirely from the repositories the individual screens already use:
 * this invents no data and computes no score, it just merges what's there into
 * one time-ordered list. Anything needing a human decision is flagged
 * `actionable` so the UI can separate "do something" from "for your
 * information".
 */
export async function buildFeed(brandId: number, limit = 40): Promise<FeedItem[]> {
  const since = Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000;
  const recent = (d: Date | string) => new Date(d).getTime() >= since;

  const [pending, suggested, notes, threads, citations, audits, memos] = await Promise.all([
    drafts.listWithContext(brandId, { status: "pending_approval", limit: 50 }),
    topics.list(brandId, { status: "suggested", limit: 20 }),
    competitorNotes.list(brandId, 100),
    redditOpportunities.list(brandId, 50),
    geoCitationChecks.listRecent(brandId, 30),
    seoAudits.listRecent(brandId, 5),
    insights.list(brandId, 3),
  ]);

  const items: FeedItem[] = [];

  for (const d of pending) {
    items.push({
      kind: "draft",
      at: new Date(d.created_at).toISOString(),
      title: `${platformFor(d.platform).label} draft ready for review`,
      detail: d.topic_angle,
      actionable: true,
      tab: "queue",
    });
  }

  for (const t of suggested.filter((t) => recent(t.created_at))) {
    items.push({
      kind: "pitch",
      at: new Date(t.created_at).toISOString(),
      title: "Idea suggested, waiting on a pick",
      detail: t.angle,
      actionable: true,
      tab: "campaigns",
    });
  }

  for (const n of notes.filter((n) => n.added_by === AUTO_MONITOR_AUTHOR && recent(n.created_at))) {
    items.push({
      kind: "competitor",
      at: new Date(n.created_at).toISOString(),
      title: `${n.competitor_name} in the news`,
      detail: n.summary,
      actionable: false,
      tab: "competitors",
    });
  }

  for (const o of threads.filter((o) => o.status === "new" && recent(o.created_at))) {
    items.push({
      kind: "reddit",
      at: new Date(o.created_at).toISOString(),
      title: `Reddit thread worth joining — r/${o.subreddit}`,
      detail: o.thread_title,
      actionable: true,
      tab: "reddit",
    });
  }

  // Only citations where the brand WAS mentioned — a miss isn't news, and one
  // row per unmentioned probe would drown everything else.
  for (const c of citations.filter((c) => c.mentioned && recent(c.checked_at))) {
    items.push({
      kind: "geo",
      at: new Date(c.checked_at).toISOString(),
      title: `Cited by ${c.engine}`,
      detail: c.response_excerpt.slice(0, 160),
      actionable: false,
      tab: "geo",
    });
  }

  for (const a of audits.filter((a) => recent(a.created_at))) {
    const failed = a.checks.filter((c) => !c.pass).length;
    items.push({
      kind: "seo",
      at: new Date(a.created_at).toISOString(),
      title: `SEO audit: ${a.score}% — ${failed} check${failed === 1 ? "" : "s"} to fix`,
      detail: a.url,
      actionable: failed > 0,
      tab: "seo",
    });
  }

  for (const m of memos.filter((m) => recent(m.created_at))) {
    items.push({
      kind: "memo",
      at: new Date(m.created_at).toISOString(),
      title: `Editorial memo — ${m.period}`,
      detail: m.memo.split("\n").find((l) => l.trim()) ?? null,
      actionable: false,
      tab: "insights",
    });
  }

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
