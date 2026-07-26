/**
 * One-line, always-visible summary + a collapsed "why" detail — replaces
 * the long always-open explainer paragraphs that used to sit at the top of
 * every intelligence tab (UI/UX pass). The honesty caveats (what's real,
 * what's not built and why) are still one click away, just not permanent
 * vertical clutter on every visit.
 */
export function InfoCallout({
  icon,
  summary,
  detail,
}: {
  icon: string;
  summary: string;
  detail: string;
}) {
  return (
    <details className="callout-box">
      <summary>
        {icon} {summary}
      </summary>
      <p className="callout-detail">{detail}</p>
    </details>
  );
}
