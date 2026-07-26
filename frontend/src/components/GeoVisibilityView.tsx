import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type GeoCitationCheck, type GeoCitationSummary, type GeoProbeQuery } from "../api";
import { EmptyState } from "./EmptyState";
import { InfoCallout } from "./InfoCallout";

export function GeoVisibilityView() {
  const [queries, setQueries] = useState<GeoProbeQuery[]>([]);
  const [summary, setSummary] = useState<GeoCitationSummary[]>([]);
  const [recent, setRecent] = useState<GeoCitationCheck[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [busyDelete, setBusyDelete] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [qs, citations] = await Promise.all([api.listGeoProbeQueries(), api.getGeoCitations()]);
      setQueries(qs);
      setConfigured(citations.configured);
      setSummary(citations.summary);
      setRecent(citations.recent);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load GEO visibility data");
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
      await api.addGeoProbeQuery(queryText.trim());
      setQueryText("");
      setOpen(false);
      await load();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Failed to add question");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    setBusyDelete(id);
    try {
      await api.deleteGeoProbeQuery(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete question");
    } finally {
      setBusyDelete(null);
    }
  }

  async function handleCheckNow() {
    setChecking(true);
    setCheckResult(null);
    setError(null);
    try {
      const res = await api.checkGeoCitationsNow();
      setCheckResult(
        res.checked > 0
          ? `Ran ${res.checked} check${res.checked === 1 ? "" : "s"} across your questions.`
          : "Nothing checked — add a question below, or an engine isn't configured yet.",
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to run citation check");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div>
      <InfoCallout
        icon="🔎"
        summary={
          configured
            ? "Real questions sent to Claude, checked for whether your brand's name shows up in the answer."
            : "GEO citation tracking isn't configured yet — set ANTHROPIC_API_KEY to enable it."
        }
        detail={
          "This is Claude's actual answer specifically — not a claim about what ChatGPT or Perplexity " +
          "would say. Those aren't built yet: each needs its own paid API key, a call for you to make, " +
          "not something to fake a result for."
        }
      />

      <div className="card">
        <div className="card-head">
          <strong>GEO probe questions</strong>
          <button className="btn" onClick={handleCheckNow} disabled={checking} style={{ marginLeft: "auto" }}>
            🔎 {checking ? "Checking…" : "Check citations now"}
          </button>
          <button className="btn" onClick={() => setOpen((v) => !v)}>
            {open ? "Cancel" : "+ Add question"}
          </button>
        </div>
        <p className="pillar-tag" style={{ marginBottom: 8 }}>
          Real questions a prospective customer might ask an AI assistant — not auto-generated. Add the
          ones that actually matter for your market.
        </p>
        {checkResult && <div className="pillar-tag" style={{ marginBottom: 8 }}>{checkResult}</div>}
        {open && (
          <form onSubmit={handleAdd}>
            <label htmlFor="geo-query">Question</label>
            <textarea
              id="geo-query"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              rows={2}
              placeholder="e.g. What are the best campus hiring assessment platforms?"
            />
            {submitError && <div className="error-box" style={{ marginTop: 12 }}>{submitError}</div>}
            <div className="row">
              <button className="btn primary" type="submit" disabled={submitting || !queryText.trim()}>
                {submitting ? "Saving…" : "Save question"}
              </button>
            </div>
          </form>
        )}
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading && <div className="spinner-text">Loading…</div>}

      {!loading && summary.length > 0 && (
        <div className="card">
          <div className="card-head">
            <strong>Citation rate (last 30 days)</strong>
          </div>
          {summary.map((s) => (
            <div key={s.engine} className="pillar-tag" style={{ marginBottom: 4 }}>
              <b>{s.engine}</b>: mentioned in {s.mentioned} of {s.checked} check{s.checked === 1 ? "" : "s"} (
              {Math.round((s.mentioned / s.checked) * 100)}%)
            </div>
          ))}
        </div>
      )}

      {!loading &&
        queries.map((q) => (
          <div className="card" key={q.id}>
            <div className="card-head">
              <span className="body-text">{q.query_text}</span>
              <button
                className="btn danger"
                style={{ marginLeft: "auto" }}
                onClick={() => handleDelete(q.id)}
                disabled={busyDelete === q.id}
              >
                {busyDelete === q.id ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        ))}

      {!loading && queries.length === 0 && !error && (
        <EmptyState
          icon="✨"
          title="No GEO probe questions yet"
          description="Add a real question a prospective customer might ask ChatGPT/Claude/Perplexity above — bimark will check whether your brand actually gets mentioned in the answer."
        />
      )}

      {!loading && recent.length > 0 && (
        <div className="card">
          <div className="card-head">
            <strong>Recent checks</strong>
          </div>
          {recent.map((r) => {
            const q = queries.find((x) => x.id === r.probe_query_id);
            return (
              <div key={r.id} className="competitor-note">
                <div className="competitor-note-head">
                  <span className="pillar-tag">
                    {new Date(r.checked_at).toLocaleDateString()} · {r.engine} ·{" "}
                    {r.mentioned ? "✅ mentioned" : "— not mentioned"}
                  </span>
                </div>
                <p className="body-text">{q?.query_text ?? "(question removed)"}</p>
                <div className="competitor-learning">💬 {r.response_excerpt}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
