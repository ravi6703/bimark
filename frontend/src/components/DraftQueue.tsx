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

export function DraftQueue() {
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

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div>
      <div className="status-tabs">
        {STATUSES.map((s) => (
          <button
            key={s.key}
            className={status === s.key ? "active" : ""}
            onClick={() => setStatus(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading && <div className="spinner-text">Loading…</div>}
      {!loading && drafts.length === 0 && (
        <div className="empty">No drafts here right now.</div>
      )}
      {drafts.map((d) => (
        <DraftCard key={d.id} draft={d} onChanged={load} />
      ))}
    </div>
  );
}
