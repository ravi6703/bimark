import { useEffect, useState } from "react";
import { api, type BrandReadiness } from "../api";

/**
 * Move 6 — say it before the work, not after.
 *
 * A brand with no owned material produces ungrounded drafts by construction.
 * The product already detected that per-draft (`low_source`), but only at
 * review time — after the LLM call was paid for and someone's attention was
 * spent on reading it. This shows the same truth at the point where it can
 * still change what you do.
 */

export function ReadinessBanner({ readiness }: { readiness: BrandReadiness | null }) {
  if (!readiness?.blockingReason) return null;
  return (
    <div className="readiness-banner" role="status">
      <strong>This brand isn't ready to draft yet.</strong> {readiness.blockingReason}
    </div>
  );
}

/** Loads readiness for the current brand. Returns null while loading or on
 * error — a readiness check that fails must never block the screen it's
 * advising about. */
export function useReadiness(): BrandReadiness | null {
  const [readiness, setReadiness] = useState<BrandReadiness | null>(null);
  useEffect(() => {
    let live = true;
    api
      .getReadiness()
      .then((r) => {
        if (live) setReadiness(r);
      })
      .catch(() => {
        /* advisory only — never surface an error for this */
      });
    return () => {
      live = false;
    };
  }, []);
  return readiness;
}

export function ReadinessPanel() {
  const readiness = useReadiness();
  if (!readiness) return null;

  return (
    <div className="card">
      <div className="card-head">
        <strong>Setup readiness</strong>
        <span className="badge" style={{ marginLeft: "auto" }}>
          {readiness.passed}/{readiness.total} ready
        </span>
      </div>
      <ReadinessBanner readiness={readiness} />
      <div>
        {readiness.checks.map((c) => (
          <div className="readiness-row" key={c.key}>
            <span className="readiness-mark" aria-hidden="true">
              {c.ok ? "✓" : c.blocking ? "✕" : "•"}
            </span>
            <span>
              {/* The state is spelled out for screen readers rather than left
                  to the glyph, which carries no accessible meaning. */}
              <span className="sr-only">{c.ok ? "Ready: " : "Not ready: "}</span>
              <b>{c.label}</b> — {c.detail}
              {c.fix && <span className="readiness-fix">{c.fix}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
