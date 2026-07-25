import { useEffect, useState } from "react";
import { api, ApiError, type Draft } from "../api";
import { DraftCard } from "./DraftCard";

const STATUSES = [
  { key: "pending_approval", label: "Needs review" },
  { key: "approved_hold", label: "Awaiting publish" },
  { key: "approved", label: "Approved" },
  { key: "edited", label: "Edited" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

export function DraftQueue({ onDraftsChanged }: { onDraftsChanged?: () => void } = {}) {
  const [status, setStatus] = useState("pending_approval");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setDrafts(await api.listDrafts(status));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load drafts");
    } finally {
      setLoading(false);
    }
  }

  function handleChanged() {
    load();
    onDraftsChanged?.();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Refetch whenever the tab regains focus — a shared queue goes stale fast
  // otherwise, and staleness directly causes teammates to duplicate each
  // other's work (audit Phase 2).
  useEffect(() => {
    function onFocus() {
      load();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div>
      <div className="queue-toolbar">
        <div className="status-tabs" role="tablist" aria-label="Filter by status">
          {STATUSES.map((s) => (
            <button
              key={s.key}
              role="tab"
              aria-selected={status === s.key}
              className={status === s.key ? "active" : ""}
              onClick={() => setStatus(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
        {!loading && !error && (
          <span className="queue-count">
            {drafts.length} draft{drafts.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading && <div className="spinner-text">Loading…</div>}
      {!loading && drafts.length === 0 && (
        <div className="empty">No drafts here right now.</div>
      )}
      {drafts.map((d) => (
        <DraftCard key={d.id} draft={d} onChanged={handleChanged} />
      ))}
    </div>
  );
}
