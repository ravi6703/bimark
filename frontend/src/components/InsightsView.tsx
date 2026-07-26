import { useEffect, useState } from "react";
import { api, ApiError, type Insight } from "../api";
import { EmptyState } from "./EmptyState";

/**
 * The monthly editorial memo (WF-7b) — previously reached only via Telegram
 * (audit Phase 1). Also honestly reports whether SOV/competitor tracking is
 * actually wired up, instead of letting a bare 0% pass as real data.
 */
export function InsightsView() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [sovConfigured, setSovConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listInsights()
      .then((r) => {
        setInsights(r.insights);
        setSovConfigured(r.sovConfigured);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (error) return <div className="error-box">{error}</div>;
  if (loading) return <div className="spinner-text">Loading…</div>;

  return (
    <div>
      {!sovConfigured && (
        <div className="callout-box">
          🔍 Share-of-voice tracking isn't connected yet — the memos below don't include real
          competitive data until a social-listening source is wired up.
        </div>
      )}
      {insights.length === 0 && (
        <EmptyState
          icon="🗒️"
          title="No editorial memos yet"
          description="The first one generates automatically at month end, summarizing what landed, what didn't, and why — based on real approval/publish activity for this brand."
        />
      )}
      {insights.map((i) => (
        <div className="card" key={i.id}>
          <div className="card-head">
            <strong>{i.period}</strong>
            <span className="pillar-tag" style={{ marginLeft: "auto" }}>
              {new Date(i.created_at).toLocaleDateString()}
            </span>
          </div>
          <div className="body-text">{i.memo}</div>
        </div>
      ))}
    </div>
  );
}
