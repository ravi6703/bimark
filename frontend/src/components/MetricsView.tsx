import { useEffect, useState } from "react";
import { api, ApiError, type QualityStats } from "../api";
import { StatTile, type StatTone } from "./StatTile";
import { EmptyState } from "./EmptyState";

function pct(n: number | null): string {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

export function MetricsView() {
  const [stats, setStats] = useState<QualityStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getQuality()
      .then(setStats)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load"));
  }, []);

  if (error) return <div className="error-box">{error}</div>;
  if (!stats) return <div className="spinner-text">Loading…</div>;

  const onCadence = stats.postsLast7Days >= stats.postsPerWeekMin;
  const approvalTone: StatTone =
    stats.firstPassApprovalRate == null
      ? "neutral"
      : stats.firstPassApprovalRate >= stats.target
        ? "green"
        : "amber";

  return (
    <div>
      <p className="pillar-tag" style={{ marginBottom: 16 }}>
        §7 — whether drafts are good enough to use with light edits. Target:{" "}
        {pct(stats.target)} first-pass approval.
      </p>

      {stats.sample === 0 ? (
        <EmptyState
          icon="📊"
          title="No activity recorded yet"
          description="These numbers come from real approvals, edits, and rejections — nothing's been reviewed for this brand yet, so there's nothing to show. Approve or edit a few drafts in the Review queue and this fills in."
        />
      ) : (
        <div className="stat-grid">
          <StatTile
            icon="📅"
            tone={onCadence ? "green" : "amber"}
            value={stats.postsLast7Days}
            label={`Posts published, last 7 days (target ${stats.postsPerWeekMin}–${stats.postsPerWeekMax}/week)`}
          />
          <StatTile
            icon="✅"
            tone={approvalTone}
            value={pct(stats.firstPassApprovalRate)}
            label="First-pass approval rate"
          />
          <StatTile
            icon="✏️"
            tone="neutral"
            value={stats.meanEditDistance == null ? "—" : Math.round(stats.meanEditDistance)}
            label="Mean edit distance (chars)"
          />
          <StatTile
            icon="🗂️"
            tone="neutral"
            value={stats.sample}
            label="Approvals + edits + rejects logged"
          />
        </div>
      )}
    </div>
  );
}
