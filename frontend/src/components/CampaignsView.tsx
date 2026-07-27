import { useEffect, useState } from "react";
import { api, ApiError, type Campaign } from "../api";
import { EmptyState } from "./EmptyState";
import { platformLabel } from "../platforms";

/** Where a channel currently stands, in words rather than raw enum names. */
function channelState(status: string, draftStatus: string | null): { icon: string; label: string } {
  if (draftStatus === "approved" || draftStatus === "edited") return { icon: "✅", label: "approved" };
  if (draftStatus === "approved_hold") return { icon: "🕒", label: "awaiting publish" };
  if (draftStatus === "rejected") return { icon: "❌", label: "rejected" };
  if (draftStatus === "pending_approval") return { icon: "📥", label: "needs review" };
  if (status === "drafting") return { icon: "⋯", label: "generating…" };
  if (status === "picked") return { icon: "⋯", label: "queued" };
  if (status === "skipped") return { icon: "—", label: "skipped" };
  if (status === "suggested") return { icon: "💡", label: "suggested" };
  return { icon: "•", label: status };
}

function SourceBadge({ source }: { source: string | null }) {
  const label =
    source === "morning_pitch" ? "AI pitch" : source === "manual" ? "Manual" : source === "trend" ? "Trend" : "—";
  return <span className="badge">{label}</span>;
}

/**
 * Campaigns — one card per idea, listing every channel it went out on.
 *
 * Replaces the Topics view, where an idea targeting five platforms appeared
 * five times as five unrelated rows because that's exactly how it was stored
 * (migration 015 gave those per-channel jobs a shared parent).
 */
export function CampaignsView({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listCampaigns()
      .then(setCampaigns)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load campaigns"))
      .finally(() => setLoading(false));
  }, []);

  const needingReview = campaigns.reduce(
    (n, c) => n + c.channels.filter((ch) => ch.draftStatus === "pending_approval").length,
    0,
  );

  return (
    <div>
      {error && <div className="error-box">{error}</div>}
      {loading && <div className="spinner-text">Loading…</div>}

      {!loading && !error && campaigns.length > 0 && (
        <p className="pillar-tag" style={{ marginBottom: 14 }}>
          {campaigns.length} idea{campaigns.length === 1 ? "" : "s"}
          {needingReview > 0 && (
            <>
              {" · "}
              <button className="btn" onClick={() => onNavigate("queue")}>
                📥 {needingReview} draft{needingReview === 1 ? "" : "s"} needing review
              </button>
            </>
          )}
        </p>
      )}

      {!loading &&
        campaigns.map((c) => (
          <div className="card" key={c.id}>
            <div className="card-head">
              <SourceBadge source={c.source} />
              <span className="pillar-tag" style={{ marginLeft: "auto" }}>
                {new Date(c.created_at).toLocaleDateString()}
              </span>
            </div>

            <div className="body-text" style={{ margin: "6px 0" }}>
              {c.title}
            </div>
            {c.why_now && <div className="pillar-tag">Why now: {c.why_now}</div>}

            {c.channels.length === 0 ? (
              <div className="pillar-tag" style={{ marginTop: 8 }}>
                No channels yet.
              </div>
            ) : (
              <div className="campaign-channels">
                {c.channels.map((ch) => {
                  const state = channelState(ch.status, ch.draftStatus);
                  return (
                    <span key={ch.topicId} className="campaign-channel">
                      <b>{platformLabel(ch.platform)}</b>
                      <span className="pillar-tag">
                        {state.icon} {state.label}
                      </span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        ))}

      {!loading && !error && campaigns.length === 0 && (
        <EmptyState
          icon="💡"
          title="No campaigns yet"
          description="A campaign is one idea and every channel it goes out on. They come from the AI's daily pitch, or from adding a topic yourself."
          action={{ label: "Add a topic", onClick: () => onNavigate("new") }}
        />
      )}
    </div>
  );
}
