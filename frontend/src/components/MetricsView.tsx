import { useEffect, useState } from "react";
import { api, ApiError, type QualityStats } from "../api";

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

  return (
    <div>
      <p className="pillar-tag" style={{ marginBottom: 16 }}>
        §7 — whether drafts are good enough to use with light edits. Target:{" "}
        {pct(stats.target)} first-pass approval.
      </p>
      <div className="stat-grid">
        <div className="stat">
          <div
            className="value"
            style={{ color: onCadence ? "var(--green)" : "var(--amber)" }}
          >
            {stats.postsLast7Days}
          </div>
          <div className="label">
            Posts published, last 7 days (target {stats.postsPerWeekMin}–{stats.postsPerWeekMax}/week)
          </div>
        </div>
        <div className="stat">
          <div
            className="value"
            style={{
              color:
                stats.firstPassApprovalRate != null && stats.firstPassApprovalRate >= stats.target
                  ? "var(--green)"
                  : "var(--amber)",
            }}
          >
            {pct(stats.firstPassApprovalRate)}
          </div>
          <div className="label">First-pass approval rate</div>
        </div>
        <div className="stat">
          <div className="value">
            {stats.meanEditDistance == null ? "—" : Math.round(stats.meanEditDistance)}
          </div>
          <div className="label">Mean edit distance (chars)</div>
        </div>
        <div className="stat">
          <div className="value">{stats.sample}</div>
          <div className="label">Approvals + edits + rejects logged</div>
        </div>
      </div>
    </div>
  );
}
