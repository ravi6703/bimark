import { useState } from "react";
import { api, ApiError, type Draft } from "../api";

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

  const needsImage = draft.platform === "instagram";
  const imageFailed = needsImage && draft.media_asset_id == null;
  const held = draft.status === "approved_hold";

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
        hold: mode === "hold",
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
        <div className="body-text">{draft.body}</div>
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

      {needsImage && draft.media_asset_id != null && (
        <>
          <img
            className="draft-image"
            src={`/api/media/${draft.media_asset_id}`}
            alt="AI-generated visual for this post"
          />
          <div className="row" style={{ marginTop: -4 }}>
            <button className="btn" type="button" onClick={handleRegenerateImage} disabled={regenerating || busy}>
              🔄 {regenerating ? "Regenerating…" : "Regenerate image"}
            </button>
          </div>
        </>
      )}
      {imageFailed && (
        <>
          <div className="meta-note flag">🖼️ Image generation failed — nothing to post yet.</div>
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
          <div className="meta-note">✅ Approved — held. Publish it yourself whenever you're ready.</div>
          <div className="row">
            <button className="btn primary" onClick={handlePublishHeld} disabled={busy}>
              🚀 {busy ? "Publishing…" : "Publish now"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="publish-mode-row">
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
          </div>
          {mode === "schedule" && (
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              style={{ marginTop: 8 }}
            />
          )}

          <div className="row">
            <button className="btn primary" onClick={handleApprove} disabled={busy}>
              ✅{" "}
              {mode === "hold"
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
