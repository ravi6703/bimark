import { useState } from "react";
import { api, ApiError, type ApprovalEntry, type Draft } from "../api";
import { PlatformPreview } from "./PlatformPreview";

/** Platform badge + human label. */
function PlatformBadge({ platform }: { platform: string }) {
  return <span className={`badge ${platform}`}>{platform === "x" ? "X" : platform}</span>;
}

type PublishMode = "now" | "schedule" | "hold";

export function DraftCard({ draft, onChanged }: { draft: Draft; onChanged: () => void }) {
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
  // GEO content has no publish API — there's no "post to ChatGPT" — so it
  // always ends up held, and its "publish" action is copy-out + mark-posted
  // instead of an automatic publish (Okara-inspired follow-up).
  const isGeo = draft.platform === "geo";
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
        hold: isGeo || mode === "hold",
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

      {draft.topic_angle && (
        <div className="pillar-tag" style={{ marginBottom: 6 }}>
          Angle: {draft.topic_angle}
        </div>
      )}

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
              : "✅ Approved — held. Publish it yourself whenever you're ready."}
          </div>
          <div className="row">
            {isGeo ? (
              <>
                <button className="btn" onClick={handleCopy}>
                  📋 {copied ? "Copied!" : "Copy markdown"}
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
          {!isGeo && (
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

          <div className="row">
            <button className="btn primary" onClick={handleApprove} disabled={busy}>
              ✅{" "}
              {isGeo
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
