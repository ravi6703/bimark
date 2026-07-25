import { useState } from "react";
import { api, ApiError, type Draft } from "../api";

/** Platform badge + human label. */
function PlatformBadge({ platform }: { platform: string }) {
  return <span className={`badge ${platform}`}>{platform === "x" ? "X" : platform}</span>;
}

export function DraftCard({ draft, onChanged }: { draft: Draft; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState(draft.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsImage = draft.platform === "instagram";
  const imageFailed = needsImage && draft.media_asset_id == null;

  async function handleApprove() {
    setError(null);
    if (imageFailed) {
      setError("Image generation failed for this draft — it can't be posted to Instagram as-is.");
      return;
    }
    setBusy(true);
    try {
      await api.approveDraft(draft.id, { editedText: editing ? editedText : undefined });
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

      {needsImage && draft.media_asset_id != null && (
        <img
          className="draft-image"
          src={`/api/media/${draft.media_asset_id}`}
          alt="AI-generated visual for this post"
        />
      )}
      {imageFailed && (
        <div className="meta-note flag">🖼️ Image generation failed — nothing to post yet.</div>
      )}

      {error && <div className="error-box" style={{ marginTop: 10 }}>{error}</div>}

      <div className="row">
        <button className="btn primary" onClick={handleApprove} disabled={busy}>
          ✅ {editing ? "Approve with edits" : "Approve"}
        </button>
        <button className="btn" onClick={() => setEditing((v) => !v)} disabled={busy}>
          ✏️ {editing ? "Cancel edit" : "Edit"}
        </button>
        <button className="btn danger" onClick={handleReject} disabled={busy}>
          ❌ Reject
        </button>
      </div>
    </div>
  );
}
