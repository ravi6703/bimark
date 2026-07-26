import { useEffect, useState } from "react";
import { api, ApiError, type Topic } from "../api";
import { EmptyState } from "./EmptyState";

const STATUSES = [
  { key: "suggested", label: "Suggested" },
  { key: "picked", label: "Picked" },
  { key: "drafting", label: "Drafting" },
  { key: "drafted", label: "Drafted" },
  { key: "skipped", label: "Skipped" },
  { key: "archived", label: "Archived" },
];

function SourceBadge({ source }: { source: string }) {
  const label = source === "morning_pitch" ? "AI pitch" : source === "manual" ? "Manual" : "Trend";
  return <span className="badge">{label}</span>;
}

/**
 * Read-only view of every topic the pipeline has produced or been given —
 * previously this only ever reached Telegram (audit Phase 1). Backend and
 * client method already existed; this is the missing screen.
 */
export function TopicsView() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setTopics(await api.listTopics(status));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load topics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div>
      <div className="status-tabs">
        <button className={status === undefined ? "active" : ""} onClick={() => setStatus(undefined)}>
          All
        </button>
        {STATUSES.map((s) => (
          <button key={s.key} className={status === s.key ? "active" : ""} onClick={() => setStatus(s.key)}>
            {s.label}
          </button>
        ))}
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading && <div className="spinner-text">Loading…</div>}
      {!loading && topics.length === 0 && (
        <EmptyState
          icon="💡"
          title="No topics here right now"
          description="Topics come from the AI's daily pitch or from someone on the team adding one manually — check back after the next pitch, or add one yourself from New topic."
        />
      )}
      {topics.map((t) => (
        <div className="card" key={t.id}>
          <div className="card-head">
            <SourceBadge source={t.source} />
            <span className={`badge ${t.platform}`}>{t.platform === "x" ? "X" : t.platform}</span>
            {t.priority > 0 && <span className="badge warn">priority {t.priority}</span>}
            <span className="pillar-tag" style={{ marginLeft: "auto" }}>
              {new Date(t.created_at).toLocaleString()}
            </span>
          </div>
          <div className="body-text" style={{ margin: "6px 0" }}>
            {t.angle || <span className="pillar-tag">(no angle recorded)</span>}
          </div>
          {t.why_now && <div className="pillar-tag">Why now: {t.why_now}</div>}
          <div className="pillar-tag" style={{ marginTop: 6 }}>
            Status: {t.status}
          </div>
        </div>
      ))}
    </div>
  );
}
