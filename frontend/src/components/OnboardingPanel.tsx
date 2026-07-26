import { useState } from "react";
import { api, ApiError, type OnboardingProposal } from "../api";

/**
 * AI-derived onboarding (Okara-inspired) — read a URL, propose a starting
 * brand profile. Nothing is applied until the human reviews/edits and hits
 * Apply; this is a proposal editor, not an auto-configure button.
 */
export function OnboardingPanel({ onApplied }: { onApplied: () => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [proposal, setProposal] = useState<OnboardingProposal | null>(null);

  async function handleAnalyze() {
    setError(null);
    setSuccess(null);
    setAnalyzing(true);
    try {
      setProposal(await api.proposeOnboarding(url.trim()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to analyze that URL");
    } finally {
      setAnalyzing(false);
    }
  }

  function updatePillar(i: number, field: "name" | "description", value: string) {
    setProposal((p) =>
      p ? { ...p, pillars: p.pillars.map((pl, idx) => (idx === i ? { ...pl, [field]: value } : pl)) } : p,
    );
  }
  function removePillar(i: number) {
    setProposal((p) => (p ? { ...p, pillars: p.pillars.filter((_, idx) => idx !== i) } : p));
  }

  async function handleApply() {
    if (!proposal) return;
    setApplying(true);
    setError(null);
    try {
      await api.updateBrand({
        voice_guide: proposal.voiceGuide,
        visual_notes: proposal.visualNotes,
        banned_topics: proposal.bannedTopics,
      });
      for (const p of proposal.pillars) {
        if (p.name.trim()) await api.createPillar({ name: p.name.trim(), description: p.description.trim() || undefined });
      }
      setSuccess(`Applied — ${proposal.pillars.length} pillar(s) added, voice guide updated.`);
      setProposal(null);
      setUrl("");
      onApplied();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to apply the proposal");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="card onboarding-panel">
      <button type="button" className="onboarding-toggle" onClick={() => setOpen((v) => !v)}>
        <span>{open ? "▾" : "▸"}</span> ✨ Set up from your website
      </button>
      {!open && (
        <p className="pillar-tag" style={{ marginTop: 6 }}>
          Read a URL and propose a starting voice guide + pillars instead of writing them from scratch.
        </p>
      )}
      {open && (
        <div style={{ marginTop: 12 }}>
          <label htmlFor="ob-url">Company URL</label>
          <div className="row" style={{ marginTop: 0 }}>
            <input
              id="ob-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://boardinfinity.com"
              style={{ flex: 1 }}
            />
            <button className="btn primary" onClick={handleAnalyze} disabled={analyzing || !url.trim()}>
              {analyzing ? "Analyzing…" : "Analyze"}
            </button>
          </div>

          {error && <div className="error-box" style={{ marginTop: 12 }}>{error}</div>}
          {success && <div className="success-box" style={{ marginTop: 12 }}>{success}</div>}

          {proposal && (
            <div className="onboarding-proposal">
              <p className="pillar-tag">
                Proposal only — nothing is saved yet. Edit anything below, then Apply.
              </p>

              <label htmlFor="ob-voice">Voice guide</label>
              <textarea
                id="ob-voice"
                rows={6}
                value={proposal.voiceGuide}
                onChange={(e) => setProposal({ ...proposal, voiceGuide: e.target.value })}
              />
              <label htmlFor="ob-visual">Visual notes</label>
              <textarea
                id="ob-visual"
                rows={2}
                value={proposal.visualNotes}
                onChange={(e) => setProposal({ ...proposal, visualNotes: e.target.value })}
              />
              <label htmlFor="ob-banned">Banned topics (comma-separated)</label>
              <input
                id="ob-banned"
                type="text"
                value={proposal.bannedTopics.join(", ")}
                onChange={(e) =>
                  setProposal({
                    ...proposal,
                    bannedTopics: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })
                }
              />

              <label style={{ marginTop: 14 }}>Proposed pillars</label>
              {proposal.pillars.map((p, i) => (
                <div className="onboarding-pillar-row" key={i}>
                  <input
                    type="text"
                    value={p.name}
                    onChange={(e) => updatePillar(i, "name", e.target.value)}
                    placeholder="Pillar name"
                  />
                  <input
                    type="text"
                    value={p.description}
                    onChange={(e) => updatePillar(i, "description", e.target.value)}
                    placeholder="One-line description"
                  />
                  <button className="btn" type="button" onClick={() => removePillar(i)}>
                    ✕
                  </button>
                </div>
              ))}

              <div className="row">
                <button className="btn primary" onClick={handleApply} disabled={applying}>
                  {applying ? "Applying…" : "✅ Apply"}
                </button>
                <button className="btn" onClick={() => setProposal(null)} disabled={applying}>
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
