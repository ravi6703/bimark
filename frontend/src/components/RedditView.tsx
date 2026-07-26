import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type RedditOpportunity, type RedditSearchTerm } from "../api";
import { EmptyState } from "./EmptyState";

function OpportunityCard({
  opportunity,
  onChanged,
}: {
  opportunity: RedditOpportunity;
  onChanged: () => void;
}) {
  const [drafting, setDrafting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDraft() {
    setDrafting(true);
    setError(null);
    try {
      await api.draftRedditReply(opportunity.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to draft a reply");
    } finally {
      setDrafting(false);
    }
  }

  function handleCopy() {
    if (!opportunity.suggested_reply) return;
    navigator.clipboard?.writeText(opportunity.suggested_reply).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleMarkPosted() {
    setBusy(true);
    setError(null);
    try {
      await api.markRedditPosted(opportunity.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to mark as posted");
    } finally {
      setBusy(false);
    }
  }

  async function handleDismiss() {
    setBusy(true);
    setError(null);
    try {
      await api.dismissRedditOpportunity(opportunity.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to dismiss");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <span className="badge">r/{opportunity.subreddit}</span>
        <span className="pillar-tag" style={{ marginLeft: "auto" }}>
          {new Date(opportunity.created_at).toLocaleDateString()} ·{" "}
          {opportunity.status === "posted" ? "✅ posted" : opportunity.status === "dismissed" ? "dismissed" : opportunity.status}
        </span>
      </div>
      <a href={opportunity.thread_url} target="_blank" rel="noreferrer" className="body-text">
        {opportunity.thread_title}
      </a>
      {opportunity.thread_excerpt && (
        <p className="pillar-tag" style={{ marginTop: 6 }}>
          {opportunity.thread_excerpt}
        </p>
      )}

      {opportunity.suggested_reply && (
        <div className="variants-box" style={{ marginTop: 10 }}>
          <div className="variants-label">Suggested reply — edit before posting, this is a starting point</div>
          <p className="body-text">{opportunity.suggested_reply}</p>
        </div>
      )}

      {error && <div className="error-box" style={{ marginTop: 10 }}>{error}</div>}

      {opportunity.status !== "posted" && opportunity.status !== "dismissed" && (
        <div className="row" style={{ marginTop: 10 }}>
          {!opportunity.suggested_reply ? (
            <button className="btn" onClick={handleDraft} disabled={drafting}>
              ✍️ {drafting ? "Drafting…" : "Draft reply"}
            </button>
          ) : (
            <>
              <button className="btn" onClick={handleCopy}>
                📋 {copied ? "Copied!" : "Copy reply"}
              </button>
              <button className="btn" onClick={handleDraft} disabled={drafting}>
                🔄 {drafting ? "Redrafting…" : "Redraft"}
              </button>
              <button className="btn primary" onClick={handleMarkPosted} disabled={busy}>
                ✅ {busy ? "Marking…" : "Mark as posted"}
              </button>
            </>
          )}
          <button className="btn danger" onClick={handleDismiss} disabled={busy} style={{ marginLeft: "auto" }}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

export function RedditView() {
  const [terms, setTerms] = useState<RedditSearchTerm[]>([]);
  const [opportunities, setOpportunities] = useState<RedditOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [subreddit, setSubreddit] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [busyDelete, setBusyDelete] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [t, o] = await Promise.all([api.listRedditSearchTerms(), api.listRedditOpportunities()]);
      setTerms(t);
      setOpportunities(o);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load Reddit data");
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
      await api.addRedditSearchTerm(term.trim(), subreddit.trim());
      setTerm("");
      setSubreddit("");
      setOpen(false);
      await load();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Failed to add search term");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteTerm(id: number) {
    setBusyDelete(id);
    try {
      await api.deleteRedditSearchTerm(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove search term");
    } finally {
      setBusyDelete(null);
    }
  }

  async function handleCheckNow() {
    setChecking(true);
    setCheckResult(null);
    setError(null);
    try {
      const res = await api.checkRedditNow();
      setCheckResult(
        res.added > 0
          ? `Found ${res.added} new thread${res.added === 1 ? "" : "s"} across ${res.checked} search term${res.checked === 1 ? "" : "s"}.`
          : `Searched ${res.checked} term${res.checked === 1 ? "" : "s"} — nothing new. Add a search term below if you haven't yet.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to search Reddit");
    } finally {
      setChecking(false);
    }
  }

  const activeOpportunities = opportunities.filter((o) => o.status !== "dismissed");

  return (
    <div>
      <div className="callout-box" style={{ marginBottom: 16 }}>
        💬 Real public threads found via Reddit's own search, for the terms you add below — nothing
        invented. A drafted reply is a starting point for a human to review and edit; nothing here ever
        posts automatically. Auto-posting would need a Reddit API app and an account to post through —
        a real decision for you to make, same as Ayrshare was for social publishing.
      </div>

      <div className="card">
        <div className="card-head">
          <strong>Search terms</strong>
          <button className="btn" onClick={handleCheckNow} disabled={checking} style={{ marginLeft: "auto" }}>
            🔎 {checking ? "Searching…" : "Find threads now"}
          </button>
          <button className="btn" onClick={() => setOpen((v) => !v)}>
            {open ? "Cancel" : "+ Add search term"}
          </button>
        </div>
        {checkResult && <div className="pillar-tag" style={{ marginBottom: 8 }}>{checkResult}</div>}
        {open && (
          <form onSubmit={handleAdd}>
            <label htmlFor="reddit-term">Search term</label>
            <input
              id="reddit-term"
              type="text"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="e.g. campus hiring assessment platform"
            />
            <label htmlFor="reddit-subreddit">Subreddit (optional — blank searches all of Reddit)</label>
            <input
              id="reddit-subreddit"
              type="text"
              value={subreddit}
              onChange={(e) => setSubreddit(e.target.value)}
              placeholder="e.g. humanresources"
            />
            {submitError && <div className="error-box" style={{ marginTop: 12 }}>{submitError}</div>}
            <div className="row">
              <button className="btn primary" type="submit" disabled={submitting || !term.trim()}>
                {submitting ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}
        {!open && terms.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {terms.map((t) => (
              <div key={t.id} className="pillar-tag" style={{ marginBottom: 6 }}>
                "{t.term}"{t.subreddit ? ` in r/${t.subreddit}` : " (all of Reddit)"}{" "}
                <button
                  className="btn danger"
                  style={{ marginLeft: 8 }}
                  onClick={() => handleDeleteTerm(t.id)}
                  disabled={busyDelete === t.id}
                >
                  {busyDelete === t.id ? "Removing…" : "Remove"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading && <div className="spinner-text">Loading…</div>}

      {!loading &&
        activeOpportunities.map((o) => <OpportunityCard key={o.id} opportunity={o} onChanged={load} />)}

      {!loading && activeOpportunities.length === 0 && !error && (
        <EmptyState
          icon="💬"
          title="No Reddit threads found yet"
          description={
            'Add a real search term above and hit "Find threads now" — bimark searches Reddit\'s own ' +
            "public search for real, relevant discussions."
          }
        />
      )}
    </div>
  );
}
