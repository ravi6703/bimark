import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type CompetitorGroup } from "../api";

export function CompetitorsView() {
  const [groups, setGroups] = useState<CompetitorGroup[]>([]);
  const [sovConfigured, setSovConfigured] = useState(false);
  const [sovCapturedAt, setSovCapturedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [competitorName, setCompetitorName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [learning, setLearning] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [busyDelete, setBusyDelete] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listCompetitors();
      setGroups(res.competitors);
      setSovConfigured(res.sovConfigured);
      setSovCapturedAt(res.sovCapturedAt);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load competitors");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      await api.addCompetitorNote({
        competitor_name: competitorName.trim(),
        summary: summary.trim(),
        learning: learning.trim() || undefined,
        source_url: sourceUrl.trim() || undefined,
      });
      setCompetitorName("");
      setSourceUrl("");
      setSummary("");
      setLearning("");
      setOpen(false);
      await load();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Failed to add note");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    setBusyDelete(id);
    try {
      await api.deleteCompetitorNote(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete note");
    } finally {
      setBusyDelete(null);
    }
  }

  return (
    <div>
      <div className="callout-box" style={{ marginBottom: 16 }}>
        {sovConfigured
          ? `📡 Share-of-voice numbers below are real, from the same weekly SOV snapshot the editorial memo uses${sovCapturedAt ? ` (last captured ${new Date(sovCapturedAt).toLocaleDateString()})` : ""}.`
          : "📡 SOV tracking isn't configured yet, so there are no automatic share-of-voice numbers here."}
        {" "}This log itself is manual — there's no scraping/monitoring source wired up to
        auto-populate competitor activity, so it only shows what the team records below.
      </div>

      <div className="card">
        <div className="card-head">
          <strong>Log what a competitor did</strong>
          <button className="btn" style={{ marginLeft: "auto" }} onClick={() => setOpen((v) => !v)}>
            {open ? "Cancel" : "+ Add note"}
          </button>
        </div>
        {open && (
          <form onSubmit={handleAdd}>
            <label htmlFor="comp-name">Competitor</label>
            <input
              id="comp-name"
              type="text"
              value={competitorName}
              onChange={(e) => setCompetitorName(e.target.value)}
              placeholder="e.g. Superset"
              list="known-competitors"
            />
            <datalist id="known-competitors">
              {groups.map((g) => (
                <option key={g.name} value={g.name} />
              ))}
            </datalist>

            <label htmlFor="comp-source">Source link (optional)</label>
            <input
              id="comp-source"
              type="text"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="e.g. link to their post/campaign"
            />

            <label htmlFor="comp-summary">What did they do?</label>
            <textarea
              id="comp-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              placeholder="e.g. launched a campus-hackathon campaign targeting tier-2 colleges"
            />

            <label htmlFor="comp-learning">What can we learn / apply? (optional)</label>
            <textarea
              id="comp-learning"
              value={learning}
              onChange={(e) => setLearning(e.target.value)}
              rows={2}
              placeholder="e.g. worth testing a similar angle for our own tier-2 outreach"
            />

            {submitError && <div className="error-box" style={{ marginTop: 12 }}>{submitError}</div>}

            <div className="row">
              <button
                className="btn primary"
                type="submit"
                disabled={submitting || !competitorName.trim() || !summary.trim()}
              >
                {submitting ? "Saving…" : "Save note"}
              </button>
            </div>
          </form>
        )}
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading && <div className="spinner-text">Loading…</div>}

      {!loading &&
        groups.map((g) => (
          <div className="card" key={g.name}>
            <div className="card-head">
              <strong>{g.name}</strong>
              {g.sovScore != null && (
                <span className="badge geo">{g.sovScore.toFixed(1)} SOV score</span>
              )}
              <span className="pillar-tag" style={{ marginLeft: "auto" }}>
                {g.notes.length} note{g.notes.length === 1 ? "" : "s"}
              </span>
            </div>
            {g.notes.length === 0 && (
              <div className="pillar-tag">Nothing logged yet for this competitor.</div>
            )}
            {g.notes.map((n) => (
              <div key={n.id} className="competitor-note">
                <div className="competitor-note-head">
                  <span className="pillar-tag">
                    {new Date(n.created_at).toLocaleDateString()} · logged by {n.added_by}
                  </span>
                  <button
                    className="btn danger"
                    style={{ marginLeft: "auto" }}
                    onClick={() => handleDelete(n.id)}
                    disabled={busyDelete === n.id}
                  >
                    {busyDelete === n.id ? "Removing…" : "Remove"}
                  </button>
                </div>
                <p className="body-text">{n.summary}</p>
                {n.learning && (
                  <div className="competitor-learning">💡 Learning: {n.learning}</div>
                )}
                {n.source_url && (
                  <a href={n.source_url} target="_blank" rel="noreferrer" className="pillar-tag">
                    Source ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        ))}
      {!loading && groups.length === 0 && !error && (
        <div className="empty">No tracked competitors yet.</div>
      )}
    </div>
  );
}
