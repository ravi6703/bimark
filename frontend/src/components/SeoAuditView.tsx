import { useEffect, useState } from "react";
import { api, ApiError, type SeoAudit } from "../api";
import { EmptyState } from "./EmptyState";
import { InfoCallout } from "./InfoCallout";

export function SeoAuditView() {
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [audits, setAudits] = useState<SeoAudit[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getSeoAudits();
      setSiteUrl(res.siteUrl);
      setAudits(res.audits);
      if (res.siteUrl) setUrlInput(res.siteUrl);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load SEO audits");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRun() {
    setRunning(true);
    setError(null);
    try {
      await api.runSeoAudit(urlInput.trim() || undefined);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Audit failed");
    } finally {
      setRunning(false);
    }
  }

  const latest = audits[0];

  return (
    <div>
      <InfoCallout
        icon="🔧"
        summary="A real, rule-based audit of your site's actual HTML/robots.txt/sitemap.xml — nothing estimated."
        detail={
          "Checks structure, not performance (Core Web Vitals would need a paid API), and doesn't " +
          "auto-apply any fix — each one is a plain-language instruction for a human to make."
        }
      />

      <div className="card">
        <div className="card-head">
          <strong>Run an audit</strong>
        </div>
        <label htmlFor="audit-url">Site URL</label>
        <input
          id="audit-url"
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder={siteUrl ?? "e.g. https://www.boardinfinity.com"}
        />
        {!siteUrl && !urlInput && (
          <p className="pillar-tag" style={{ marginTop: 6 }}>
            No website set for this brand yet — enter one here, or set it once in Pillars &amp; brand.
          </p>
        )}
        {error && <div className="error-box" style={{ marginTop: 12 }}>{error}</div>}
        <div className="row">
          <button className="btn primary" onClick={handleRun} disabled={running || !urlInput.trim()}>
            🔎 {running ? "Auditing…" : "Run audit now"}
          </button>
        </div>
      </div>

      {loading && <div className="spinner-text">Loading…</div>}

      {!loading && latest && (
        <div className="card">
          <div className="card-head">
            <strong>Latest audit</strong>
            <span className="pillar-tag" style={{ marginLeft: "auto" }}>
              {new Date(latest.created_at).toLocaleString()} · {latest.url}
            </span>
          </div>
          <div className="pillar-tag" style={{ marginBottom: 10, fontSize: 15, fontWeight: 700 }}>
            Score: {latest.score}%
          </div>
          {latest.checks.map((c, i) => (
            <div key={i} className={`meta-note ${c.pass ? "" : "flag"}`} style={{ marginBottom: 6 }}>
              {c.pass ? "✅" : "❌"} <b>{c.label}</b> — {c.detail}
              {c.fix && (
                <div className="pillar-tag" style={{ marginTop: 2 }}>
                  Fix: {c.fix}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && audits.length === 0 && !error && (
        <EmptyState
          icon="🔧"
          title="No audits run yet"
          description="Enter your site's URL above and run an audit — it genuinely fetches the live page and checks it for real, nothing estimated."
        />
      )}

      {!loading && audits.length > 1 && (
        <div className="card">
          <div className="card-head">
            <strong>History</strong>
          </div>
          {audits.slice(1).map((a) => (
            <div key={a.id} className="pillar-tag" style={{ marginBottom: 4 }}>
              {new Date(a.created_at).toLocaleDateString()} — {a.score}% ({a.url})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
