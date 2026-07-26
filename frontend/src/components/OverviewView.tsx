import { useEffect, useState } from "react";
import { api, ApiError, type QualityStats, type CompetitorGroup } from "../api";
import { StatTile, type StatTone } from "./StatTile";
import { useBrandName } from "../brandContext";

function pct(n: number | null): string {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

/** Okara-inspired dashboard polish — an "at a glance" landing page instead
 * of dropping straight into the review queue with no summary in sight.
 * Every number here is read from the same endpoints the other tabs use —
 * nothing new is computed or invented for this view. */
export function OverviewView({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const brandName = useBrandName();
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [pillarCount, setPillarCount] = useState<number | null>(null);
  const [quality, setQuality] = useState<QualityStats | null>(null);
  const [competitors, setCompetitors] = useState<CompetitorGroup[] | null>(null);
  const [sovConfigured, setSovConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.listDrafts("pending_approval"),
      api.listPillars(),
      api.getQuality(),
      api.listCompetitors(),
    ])
      .then(([drafts, pillars, qualityStats, comp]) => {
        setPendingCount(drafts.length);
        setPillarCount(pillars.length);
        setQuality(qualityStats);
        setCompetitors(comp.competitors);
        setSovConfigured(comp.sovConfigured);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load overview"));
  }, []);

  if (error) return <div className="error-box">{error}</div>;

  const loading = pendingCount == null || pillarCount == null || quality == null || competitors == null;

  const autoMentions = (competitors ?? [])
    .flatMap((g) => g.notes)
    .filter((n) => n.added_by === "auto-monitor").length;

  const onCadence = quality != null && quality.postsLast7Days >= quality.postsPerWeekMin;
  const approvalTone: StatTone =
    quality?.firstPassApprovalRate == null
      ? "neutral"
      : quality.firstPassApprovalRate >= quality.target
        ? "green"
        : "amber";

  return (
    <div>
      <p className="pillar-tag" style={{ marginBottom: 16 }}>
        {brandName} at a glance — every number below reads from the same data as its own tab.
      </p>

      {loading ? (
        <div className="spinner-text">Loading…</div>
      ) : (
        <>
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

          <div className="row" style={{ marginTop: 20 }}>
            <button className="btn primary" onClick={() => onNavigate("queue")}>
              📥 Go to review queue
            </button>
            <button className="btn" onClick={() => onNavigate("competitors")}>
              🕵️ Competitors
            </button>
          </div>
        </>
      )}
    </div>
  );
}
