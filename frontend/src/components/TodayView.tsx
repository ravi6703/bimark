import { useEffect, useState } from "react";
import { api, ApiError, type CompetitorGroup, type FeedItem, type QualityStats } from "../api";
import { StatTile, type StatTone } from "./StatTile";
import { EmptyState } from "./EmptyState";
import { useBrandName } from "../brandContext";

function pct(n: number | null): string {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

const KIND_ICON: Record<FeedItem["kind"], string> = {
  draft: "📥",
  pitch: "💡",
  competitor: "🕵️",
  reddit: "💬",
  geo: "🛰️",
  seo: "🔧",
  memo: "🗒️",
};

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function FeedRow({ item, onNavigate }: { item: FeedItem; onNavigate: (tab: string) => void }) {
  return (
    <button className={`feed-row ${item.actionable ? "actionable" : ""}`} onClick={() => onNavigate(item.tab)}>
      <span className="feed-icon">{KIND_ICON[item.kind]}</span>
      <span className="feed-body">
        <span className="feed-title">{item.title}</span>
        {item.detail && <span className="feed-detail">{item.detail}</span>}
      </span>
      <span className="feed-time">{timeAgo(item.at)}</span>
    </button>
  );
}

/**
 * Today — the agent feed, plus where the brand stands right now.
 *
 * Replaces the Overview tab. The stat tiles are unchanged; what's new is the
 * stream below them, which merges everything the agents found or drafted into
 * one time-ordered list. The alternative was remembering to open six separate
 * dashboards to notice anything had happened.
 */
export function TodayView({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const brandName = useBrandName();
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [pillarCount, setPillarCount] = useState<number | null>(null);
  const [quality, setQuality] = useState<QualityStats | null>(null);
  const [competitors, setCompetitors] = useState<CompetitorGroup[] | null>(null);
  const [sovConfigured, setSovConfigured] = useState(false);
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.listDrafts("pending_approval"),
      api.listPillars(),
      api.getQuality(),
      api.listCompetitors(),
      api.getFeed(),
    ])
      .then(([draftRows, pillars, qualityStats, comp, items]) => {
        setPendingCount(draftRows.length);
        setPillarCount(pillars.length);
        setQuality(qualityStats);
        setCompetitors(comp.competitors);
        setSovConfigured(comp.sovConfigured);
        setFeed(items);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load"));
  }, []);

  if (error) return <div className="error-box">{error}</div>;

  const loading =
    pendingCount == null || pillarCount == null || quality == null || competitors == null || feed == null;
  if (loading) return <div className="spinner-text">Loading…</div>;

  const autoMentions = (competitors ?? [])
    .flatMap((g) => g.notes)
    .filter((n) => n.added_by === "auto-monitor").length;
  const onCadence = quality!.postsLast7Days >= quality!.postsPerWeekMin;
  const approvalTone: StatTone =
    quality!.firstPassApprovalRate == null
      ? "neutral"
      : quality!.firstPassApprovalRate >= quality!.target
        ? "green"
        : "amber";

  const needsYou = feed!.filter((i) => i.actionable);
  const fyi = feed!.filter((i) => !i.actionable);

  return (
    <div>
      <p className="pillar-tag" style={{ marginBottom: 16 }}>
        {brandName} at a glance — every number below reads from the same data as its own tab.
      </p>

      <div className="stat-grid">
        <StatTile
          icon="📥"
          tone={pendingCount! > 0 ? "accent" : "green"}
          value={pendingCount!}
          label="Drafts needing review"
        />
        <StatTile
          icon="📅"
          tone={onCadence ? "green" : "amber"}
          value={quality!.postsLast7Days}
          label={`Posts published, last 7 days (target ${quality!.postsPerWeekMin}–${quality!.postsPerWeekMax})`}
        />
        <StatTile
          icon="✅"
          tone={approvalTone}
          value={pct(quality!.firstPassApprovalRate)}
          label="First-pass approval rate"
        />
        <StatTile icon="🧭" tone="neutral" value={pillarCount!} label="Active content pillars" />
      </div>

      <div className="stat-grid" style={{ marginTop: 12 }}>
        <StatTile
          icon="🕵️"
          tone={autoMentions > 0 ? "accent" : "neutral"}
          value={autoMentions}
          label="Competitor mentions auto-detected"
        />
        <StatTile
          icon="📡"
          tone={sovConfigured ? "accent" : "neutral"}
          value={sovConfigured ? "Configured" : "Not set up"}
          label="Share-of-voice tracking"
        />
      </div>

      {needsYou.length > 0 && (
        <>
          <h2 className="feed-heading">Needs you ({needsYou.length})</h2>
          <div className="card feed-list">
            {needsYou.map((item, i) => (
              <FeedRow key={`${item.kind}-${item.at}-${i}`} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        </>
      )}

      {fyi.length > 0 && (
        <>
          <h2 className="feed-heading">What the agents found</h2>
          <div className="card feed-list">
            {fyi.map((item, i) => (
              <FeedRow key={`${item.kind}-${item.at}-${i}`} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        </>
      )}

      {feed!.length === 0 && (
        <EmptyState
          icon="☕"
          title="Nothing new"
          description="No drafts waiting, and the agents haven't turned anything up in the last two weeks. This fills in as the daily pitch runs and the weekly agents check for competitor mentions, Reddit threads and citations."
          action={{ label: "Add a topic", onClick: () => onNavigate("new") }}
        />
      )}
    </div>
  );
}
