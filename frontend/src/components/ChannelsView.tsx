import { useEffect, useState } from "react";
import { api, ApiError, type ChannelStatus } from "../api";
import { InfoCallout } from "./InfoCallout";

/** How this week's output compares to the channel's configured cadence. */
function cadence(c: ChannelStatus): { text: string; tone: "green" | "amber" | "neutral" } {
  if (c.weeklyTarget == null) {
    return { text: `${c.postsThisWeek} this week · no target set`, tone: "neutral" };
  }
  const behind = c.weeklyTarget - c.postsThisWeek;
  if (behind <= 0) {
    return { text: `${c.postsThisWeek} of ${c.weeklyTarget} this week · on track`, tone: "green" };
  }
  return {
    text: `${c.postsThisWeek} of ${c.weeklyTarget} this week · ${behind} behind`,
    tone: "amber",
  };
}

function ChannelCard({ channel, onChanged }: { channel: ChannelStatus; onChanged: () => void }) {
  const [target, setTarget] = useState(String(channel.weeklyTarget ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pace = cadence(channel);

  async function save(patch: { weekly_target?: number; active?: boolean }) {
    setSaving(true);
    setError(null);
    try {
      await api.updateChannel(channel.platform, patch);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ opacity: channel.active ? 1 : 0.55 }}>
      <div className="card-head">
        <strong>{channel.label}</strong>
        {!channel.autoPublish && <span className="badge">manual publish</span>}
        {!channel.active && <span className="badge">paused</span>}
        <button
          className="btn"
          style={{ marginLeft: "auto" }}
          onClick={() => save({ active: !channel.active })}
          disabled={saving}
        >
          {channel.active ? "Pause" : "Resume"}
        </button>
      </div>

      <div className="portfolio-stat-row">
        <div className="portfolio-stat">
          <span className="portfolio-stat-value">{channel.pendingReview}</span>
          <span className="portfolio-stat-label">needing review</span>
        </div>
        <div className="portfolio-stat">
          <span className={`portfolio-stat-value tone-${pace.tone}`}>{channel.postsThisWeek}</span>
          <span className="portfolio-stat-label">posts this week</span>
        </div>
        <div className="portfolio-stat">
          <span className="portfolio-stat-value">{channel.publishedTotal}</span>
          <span className="portfolio-stat-label">published all time</span>
        </div>
      </div>

      <div className="pillar-tag" style={{ marginTop: 8 }}>
        {pace.text}
      </div>

      <div className="row" style={{ marginTop: 10, alignItems: "center", gap: 8 }}>
        <label htmlFor={`target-${channel.platform}`} className="pillar-tag" style={{ margin: 0 }}>
          Posts per week
        </label>
        <input
          id={`target-${channel.platform}`}
          type="number"
          min={0}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          style={{ width: 80 }}
        />
        <button
          className="btn"
          disabled={saving || target === String(channel.weeklyTarget ?? "")}
          onClick={() => {
            const n = Number(target);
            if (Number.isInteger(n) && n >= 0) save({ weekly_target: n });
            else setError("Enter a whole number, 0 or more.");
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {error && <div className="error-box" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}

/**
 * Channels — one card per channel, each with its own queue, cadence and
 * results. The navigational half of "each channel is its own pipeline":
 * previously the only per-channel view was a filter on the review queue, and
 * a channel's weekly target existed in the database but appeared nowhere.
 */
export function ChannelsView() {
  const [channels, setChannels] = useState<ChannelStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .listChannels()
      .then(setChannels)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load channels"));
  }

  useEffect(load, []);

  return (
    <div>
      <InfoCallout
        icon="📡"
        summary="Each channel's own queue, cadence and results — all real counts, nothing estimated."
        detail={
          "Posts per week is a real target, not a display setting: the daily pitch picks whichever " +
          "channel is furthest behind it. A channel with no target set is never chosen that way. " +
          "Pausing a channel takes it out of that rotation."
        }
      />

      {error && <div className="error-box">{error}</div>}
      {!channels && !error && <div className="spinner-text">Loading…</div>}

      {channels?.map((c) => (
        <ChannelCard key={c.platform} channel={c} onChanged={load} />
      ))}
    </div>
  );
}
