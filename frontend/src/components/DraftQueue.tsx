import { useEffect, useMemo, useState } from "react";
import { api, ApiError, type Draft } from "../api";
import { DraftCard } from "./DraftCard";
import { EmptyState } from "./EmptyState";

const STATUSES = [
  { key: "pending_approval", label: "Needs review" },
  { key: "approved_hold", label: "Awaiting publish" },
  { key: "approved", label: "Approved" },
  { key: "edited", label: "Edited" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

// Per-platform separation (Okara-inspired follow-up) — previously every
// platform's drafts sat in one blended list; that made it hard to review
// LinkedIn in one pass, Instagram in another, etc. This tab sits ABOVE the
// status filter, so "LinkedIn, needs review" is its own clean view.
const PLATFORMS = [
  { key: "all", label: "All platforms", icon: "🗂️" },
  { key: "linkedin", label: "LinkedIn", icon: "💼" },
  { key: "instagram", label: "Instagram", icon: "📸" },
  { key: "x", label: "X", icon: "✖️" },
  { key: "geo", label: "GEO", icon: "✨" },
  { key: "youtube", label: "YouTube", icon: "🎬" },
];

// What each platform tab actually means — shown so "GEO" and "YouTube" aren't
// unexplained jargon sitting next to the familiar social platforms.
const PLATFORM_EXPLAINERS: Record<string, string> = {
  linkedin: "💼 Long-form thought-leadership posts, published automatically once approved.",
  instagram: "📸 Caption + an auto-generated image, published automatically once approved.",
  x: "✖️ Short, single-idea posts, published automatically once approved.",
  geo: '✨ GEO = Generative-Engine Optimization: a direct-answer article written to be found and cited by AI answer engines (ChatGPT, Perplexity) — not a social post. There\'s no publish API for that, so approving it just copies the text out for you to place on your own site/CMS, then "Mark as posted" logs it here.',
  youtube: "🎬 A script/outline for a video, not a finished video — nothing is filmed or uploaded automatically. Approving locks the script in for you to shoot and upload yourself, then \"Mark as posted\" logs it here.",
};

export function DraftQueue({ onDraftsChanged }: { onDraftsChanged?: () => void } = {}) {
  const [status, setStatus] = useState("pending_approval");
  const [platform, setPlatform] = useState("all");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const platformCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of drafts) counts[d.platform] = (counts[d.platform] ?? 0) + 1;
    return counts;
  }, [drafts]);

  const visibleDrafts = useMemo(
    () => (platform === "all" ? drafts : drafts.filter((d) => d.platform === platform)),
    [drafts, platform],
  );

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
      <div className="platform-tabs" role="tablist" aria-label="Filter by platform">
        {PLATFORMS.map((p) => {
          const count = p.key === "all" ? drafts.length : platformCounts[p.key] ?? 0;
          return (
            <button
              key={p.key}
              role="tab"
              aria-selected={platform === p.key}
              className={platform === p.key ? "active" : ""}
              onClick={() => setPlatform(p.key)}
            >
              <span aria-hidden="true">{p.icon}</span> {p.label}
              {count > 0 && <span className="platform-tab-count">{count}</span>}
            </button>
          );
        })}
      </div>

      {platform !== "all" && (
        <div className="callout-box" style={{ marginBottom: 16 }}>
          {PLATFORM_EXPLAINERS[platform]}
        </div>
      )}

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
            {visibleDrafts.length} draft{visibleDrafts.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading && <div className="spinner-text">Loading…</div>}
      {!loading && visibleDrafts.length === 0 && (
        <EmptyState
          icon={drafts.length === 0 ? "📥" : "🔍"}
          title={drafts.length === 0 ? "Nothing here right now" : "No matches for this filter"}
          description={
            drafts.length === 0
              ? "Drafts show up here once a topic gets generated — try New topic to create one, or check back after the next scheduled pitch."
              : "No drafts for this platform in this status — try another platform or status tab above."
          }
        />
      )}
      {visibleDrafts.map((d) => (
        <DraftCard key={d.id} draft={d} onChanged={handleChanged} />
      ))}
    </div>
  );
}
