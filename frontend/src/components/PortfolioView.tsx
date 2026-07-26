import { useEffect, useState } from "react";
import { api, ApiError, type Brand } from "../api";

interface BrandRow extends Brand {
  summary: Awaited<ReturnType<typeof api.getBrandSummary>> | null;
  summaryError: boolean;
}

/**
 * Cross-brand rollup — the one page that answers "how's the whole
 * portfolio doing" without clicking through the brand switcher once per
 * brand. Built for a founder/leadership view: every brand's key numbers
 * side by side, same real data each brand's own Overview tab shows,
 * nothing new computed. Read-only — switch into a brand's own Overview to
 * act on anything.
 */
export function PortfolioView({ onOpenBrand }: { onOpenBrand: (slug: string) => void }) {
  const [rows, setRows] = useState<BrandRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listBrands()
      .then(async (brands) => {
        const withSummaries = await Promise.all(
          brands.map(async (b) => {
            try {
              const summary = await api.getBrandSummary(b.slug);
              return { ...b, summary, summaryError: false };
            } catch {
              return { ...b, summary: null, summaryError: true };
            }
          }),
        );
        if (!cancelled) setRows(withSummaries);
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Failed to load portfolio"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="error-box">{error}</div>;
  if (!rows) return <div className="spinner-text">Loading…</div>;

  return (
    <div>
      <p className="pillar-tag" style={{ marginBottom: 16 }}>
        Every brand line at a glance — same real numbers as each brand's own Overview tab, nothing
        new computed for this view.
      </p>

      {rows.map((b) => (
        <div className="card" key={b.slug}>
          <div className="card-head">
            <strong>{b.name}</strong>
            <button className="btn" style={{ marginLeft: "auto" }} onClick={() => onOpenBrand(b.slug)}>
              Open →
            </button>
          </div>
          {b.summaryError && <div className="error-box">Couldn't load this brand's numbers.</div>}
          {b.summary && (
            <div className="portfolio-stat-row">
              <div className="portfolio-stat">
                <span className="portfolio-stat-value">{b.summary.pendingCount}</span>
                <span className="portfolio-stat-label">needing review</span>
              </div>
              <div className="portfolio-stat">
                <span className="portfolio-stat-value">
                  {b.summary.postsLast7Days}/{b.summary.postsPerWeekMin}–{b.summary.postsPerWeekMax}
                </span>
                <span className="portfolio-stat-label">posts this week</span>
              </div>
              <div className="portfolio-stat">
                <span className="portfolio-stat-value">
                  {b.summary.firstPassApprovalRate == null
                    ? "—"
                    : `${Math.round(b.summary.firstPassApprovalRate * 100)}%`}
                </span>
                <span className="portfolio-stat-label">first-pass approval</span>
              </div>
              <div className="portfolio-stat">
                <span className="portfolio-stat-value">{b.summary.autoMentions}</span>
                <span className="portfolio-stat-label">competitor mentions</span>
              </div>
              <div className="portfolio-stat">
                <span className="portfolio-stat-value">{b.summary.sovConfigured ? "✓" : "—"}</span>
                <span className="portfolio-stat-label">SOV tracking</span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
