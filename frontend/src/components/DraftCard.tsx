import { useState } from "react";
import { api, ApiError, type ApprovalEntry, type Draft } from "../api";
import { PlatformPreview } from "./PlatformPreview";
import { useBrandName } from "../brandContext";

/** Platform badge + human label. */
function PlatformBadge({ platform }: { platform: string }) {
  return <span className={`badge ${platform}`}>{platform === "x" ? "X" : platform}</span>;
}

const SOURCE_LABEL: Record<string, string> = {
  morning_pitch: "an AI-suggested daily pitch",
  manual: "a topic entered by someone on the team",
  trend: "a timeliness/trend signal",
};

/**
 * "Why was this made" (Okara-inspired follow-up). Explains the FORMAT choice
 * for this platform, not just that a platform was picked — this is the part
 * that was previously invisible to reviewers.
 */
function formatRationale(draft: Draft): string {
  switch (draft.platform) {
    case "linkedin": {
      const extra = draft.topic_platform_extra as { audience?: string; cta?: string } | null;
      const bits = [
        "Long-form thought-leadership post for LinkedIn's B2B audience.",
        extra?.audience ? `Targeted at: ${extra.audience}.` : "",
        extra?.cta ? `Ends with a specific call to action.` : "",
      ];
      return bits.filter(Boolean).join(" ");
    }
    case "x": {
      const extra = draft.topic_platform_extra as { angleStyle?: string } | null;
      return extra?.angleStyle
        ? `Short-form X post, written with a ${extra.angleStyle.replace("-", " ")} angle.`
        : "Short-form X post — one sharp idea, not a LinkedIn summary.";
    }
    case "instagram": {
      const extra = draft.topic_platform_extra as { visualStyle?: string } | null;
      return `Caption + auto-generated visual${extra?.visualStyle ? ` (${extra.visualStyle} style)` : ""}, warmer tone than LinkedIn.`;
    }
    case "geo": {
      const extra = draft.topic_platform_extra as { targetQuestion?: string } | null;
      return extra?.targetQuestion
        ? `Direct-answer format for AI answer engines — written to answer "${extra.targetQuestion}".`
        : "Direct-answer format for AI answer engines (ChatGPT, Perplexity), not a social feed.";
    }
    case "youtube": {
      const extra = draft.topic_platform_extra as { videoAngle?: string } | null;
      return `Script/outline for a human to shoot${extra?.videoAngle ? `, as a ${extra.videoAngle}` : ""} — no video is generated automatically.`;
    }
    default:
      return "";
  }
}

function RationaleBlock({ draft }: { draft: Draft }) {
  const hasAnything =
    draft.pillar_name || draft.topic_angle || draft.topic_why_now || draft.topic_source;
  if (!hasAnything) return null;
  return (
    <details className="rationale-box" open>
      <summary>Why this was made</summary>
      <ul>
        {draft.pillar_name && (
          <li>
            <b>Pillar:</b> {draft.pillar_name}
          </li>
        )}
        {draft.topic_angle && (
          <li>
            <b>Angle:</b> {draft.topic_angle}
          </li>
        )}
        {draft.topic_why_now && (
          <li>
            <b>Why now:</b> {draft.topic_why_now}
          </li>
        )}
        {draft.topic_source && (
          <li>
            <b>Sourced from:</b> {SOURCE_LABEL[draft.topic_source] ?? draft.topic_source}
          </li>
        )}
        <li>
          <b>Format:</b> {formatRationale(draft)}
        </li>
        {draft.claims_used != null && draft.claims_used.length > 0 && (
          <li>
            <b>Grounded in:</b> {draft.claims_used.length} cited source
            {draft.claims_used.length === 1 ? "" : "s"} from owned material (see "Sources" below).
          </li>
        )}
      </ul>
    </details>
  );
}

type PublishMode = "now" | "schedule" | "hold";

export function DraftCard({ draft, onChanged }: { draft: Draft; onChanged: () => void }) {
  const brandName = useBrandName();
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState(draft.body ?? "");
  const [mode, setMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [activity, setActivity] = useState<ApprovalEntry[] | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);

  async function loadActivity() {
    if (activity != null) return; // already loaded, toggling just re-shows it
    try {
      setActivity(await api.getDraftActivity(draft.id));
    } catch (err) {
      setActivityError(err instanceof ApiError ? err.message : "Failed to load activity");
    }
  }

  const needsImage = draft.platform === "instagram";
  const imageFailed = needsImage && draft.media_asset_id == null;
  const held = draft.status === "approved_hold";
  // GEO has no publish API — there's no "post to ChatGPT" — and YouTube has
  // no video-generation pipeline to produce an actual upload from. Both
  // always end up held, and their "publish" action is copy-out + mark-posted
  // instead of an automatic publish (Okara-inspired follow-up).
  const isGeo = draft.platform === "geo";
  const isYoutube = draft.platform === "youtube";
  const isManualPublish = isGeo || isYoutube;
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard?.writeText(draft.body ?? "").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleMarkPosted() {
    setBusy(true);
    setError(null);
    try {
      await api.markPosted(draft.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Mark-as-posted failed");
    } finally {
      setBusy(false);
    }
  }

  function useVariant(text: string) {
    setEditedText(text);
    setEditing(true);
  }

  async function handleRegenerateImage() {
    setError(null);
    setRegenerating(true);
    try {
      await api.regenerateImage(draft.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Regenerate failed");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleApprove() {
    setError(null);
    if (imageFailed) {
      setError("Image generation failed for this draft — it can't be posted to Instagram as-is.");
      return;
    }
    if (mode === "schedule" && !scheduledAt) {
      setError("Pick a date/time to schedule for.");
      return;
    }
    setBusy(true);
    try {
      await api.approveDraft(draft.id, {
        editedText: editing ? editedText : undefined,
        scheduledAt: mode === "schedule" ? new Date(scheduledAt).toISOString() : undefined,
        hold: isManualPublish || mode === "hold",
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    setError(null);
    try {
      await api.rejectDraft(draft.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Reject failed");
    } finally {
      setBusy(false);
    }
  }

  async function handlePublishHeld() {
    setBusy(true);
    setError(null);
    try {
      await api.publishHeldDraft(draft.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <PlatformBadge platform={draft.platform} />
        {draft.pillar_name && <span className="pillar-tag">{draft.pillar_name}</span>}
        <span className="pillar-tag" style={{ marginLeft: "auto" }}>
          {new Date(draft.created_at).toLocaleString()}
        </span>
      </div>

      <RationaleBlock draft={draft} />

      {editing ? (
        <textarea
          value={editedText}
          onChange={(e) => setEditedText(e.target.value)}
          rows={6}
        />
      ) : (
        <PlatformPreview
          platform={draft.platform}
          body={draft.body ?? ""}
          mediaAssetId={draft.media_asset_id}
          brandName={brandName}
        />
      )}

      {isGeo && draft.geo_readiness && (
        <details className="geo-readiness-box">
          <summary>
            GEO readiness: <b>{draft.geo_readiness.score}%</b>
          </summary>
          <ul>
            {draft.geo_readiness.checks.map((c, i) => (
              <li key={i} className={c.pass ? "pass" : "fail"}>
                {c.pass ? "✓" : "✗"} {c.label}
              </li>
            ))}
          </ul>
          <p className="pillar-tag" style={{ marginTop: 4 }}>
            A rule-based self-check on this piece, not a real cross-engine citation measurement —
            that would need a paid API actually querying ChatGPT/Perplexity/etc.
          </p>
        </details>
      )}

      {draft.low_source && (
        <div className="meta-note">
          ⚠️ Low source — no strong owned material matched, this draft is lighter on proof.
        </div>
      )}
      {draft.reviewer_result?.verdict === "flag" && (
        <div className="meta-note flag">
          🚩 Reviewer flagged (escalated): {draft.reviewer_result.notes}
        </div>
      )}
      {draft.repetitive && (
        <div className="meta-note">
          🔁 Looks similar to a recent post{draft.similar_to_draft_id ? ` (draft #${draft.similar_to_draft_id})` : ""} — worth a genuinely new angle instead?
        </div>
      )}

      {draft.variants != null && draft.variants.length > 0 && (
        <div className="variants-box">
          <div className="variants-label">Alternate hooks the AI drafted</div>
          {draft.variants.map((v, i) => (
            <div className="variant-row" key={i}>
              <span>{v}</span>
              <button className="btn" type="button" onClick={() => useVariant(v)} disabled={busy}>
                Use this
              </button>
            </div>
          ))}
        </div>
      )}

      {draft.claims_used != null && draft.claims_used.length > 0 && (
        <details className="sources-box" open={showSources} onToggle={(e) => setShowSources(e.currentTarget.open)}>
          <summary>Sources this draft cites ({draft.claims_used.length})</summary>
          <ul>
            {draft.claims_used.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </details>
      )}

      <details className="activity-box" onToggle={(e) => e.currentTarget.open && loadActivity()}>
        <summary>Activity</summary>
        {activityError && <div className="error-box" style={{ marginTop: 8 }}>{activityError}</div>}
        {activity == null && !activityError && <div className="pillar-tag">Loading…</div>}
        {activity != null && activity.length === 0 && (
          <div className="pillar-tag">No actions recorded yet.</div>
        )}
        {activity != null && activity.length > 0 && (
          <ul className="activity-list">
            {activity.map((a) => (
              <li key={a.id}>
                <b>{a.approver}</b> {a.action}
                {a.action === "edit" && a.edit_distance != null ? ` (${a.edit_distance} chars changed)` : ""}
                {a.reason ? ` — ${a.reason}` : ""}
                <span className="activity-time">{new Date(a.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </details>

      {needsImage && draft.media_asset_id != null && !editing && (
        <div className="row" style={{ marginTop: -4 }}>
          <button className="btn" type="button" onClick={handleRegenerateImage} disabled={regenerating || busy}>
            🔄 {regenerating ? "Regenerating…" : "Regenerate image"}
          </button>
        </div>
      )}
      {imageFailed && (
        <>
          {editing && <div className="meta-note flag">🖼️ Image generation failed — nothing to post yet.</div>}
          <div className="row" style={{ marginTop: -4 }}>
            <button className="btn" type="button" onClick={handleRegenerateImage} disabled={regenerating}>
              🔄 {regenerating ? "Trying again…" : "Try generating again"}
            </button>
          </div>
        </>
      )}

      {error && <div className="error-box" style={{ marginTop: 10 }}>{error}</div>}

      {held ? (
        <>
          <div className="meta-note">
            {isGeo
              ? "✅ Approved — GEO content has no platform to auto-publish to. Copy it into your own site/CMS, then mark it posted."
              : isYoutube
                ? "✅ Approved — this is a script, there's no video pipeline to auto-publish. Shoot/upload it yourself, then mark it posted."
                : "✅ Approved — held. Publish it yourself whenever you're ready."}
          </div>
          <div className="row">
            {isManualPublish ? (
              <>
                <button className="btn" onClick={handleCopy}>
                  📋 {copied ? "Copied!" : "Copy " + (isYoutube ? "script" : "markdown")}
                </button>
                <button className="btn primary" onClick={handleMarkPosted} disabled={busy}>
                  ✅ {busy ? "Marking…" : "Mark as posted"}
                </button>
              </>
            ) : (
              <button className="btn primary" onClick={handlePublishHeld} disabled={busy}>
                🚀 {busy ? "Publishing…" : "Publish now"}
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          {!isManualPublish && (
            <>
              <fieldset className="publish-mode-row">
                <legend>Publish mode</legend>
                <label>
                  <input
                    type="radio"
                    name={`mode-${draft.id}`}
                    checked={mode === "now"}
                    onChange={() => setMode("now")}
                  />
                  Publish now
                </label>
                <label>
                  <input
                    type="radio"
                    name={`mode-${draft.id}`}
                    checked={mode === "schedule"}
                    onChange={() => setMode("schedule")}
                  />
                  Schedule
                </label>
                <label>
                  <input
                    type="radio"
                    name={`mode-${draft.id}`}
                    checked={mode === "hold"}
                    onChange={() => setMode("hold")}
                  />
                  Approve &amp; hold (publish manually later)
                </label>
              </fieldset>
              {mode === "schedule" && (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  style={{ marginTop: 8 }}
                />
              )}
            </>
          )}
          {isGeo && (
            <div className="meta-note" style={{ marginTop: 8 }}>
              ✨ GEO content — approving copies it out for your own site/CMS, there's nowhere to
              auto-publish it to.
            </div>
          )}
          {isYoutube && (
            <div className="meta-note" style={{ marginTop: 8 }}>
              🎬 This is a script/outline, not a finished video — approving locks it in for you to
              shoot and upload yourself, there's nowhere to auto-publish it to.
            </div>
          )}

          <div className="row">
            <button className="btn primary" onClick={handleApprove} disabled={busy}>
              ✅{" "}
              {isManualPublish
                ? "Approve"
                : mode === "hold"
                  ? "Approve & hold"
                  : mode === "schedule"
                    ? "Schedule"
                    : editing
                      ? "Approve with edits"
                      : "Approve"}
            </button>
            <button className="btn" onClick={() => setEditing((v) => !v)} disabled={busy}>
              ✏️ {editing ? "Cancel edit" : "Edit"}
            </button>
            <button className="btn danger" onClick={handleReject} disabled={busy}>
              ❌ Reject
            </button>
          </div>
        </>
      )}
    </div>
  );
}
