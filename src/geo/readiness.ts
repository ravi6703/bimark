/**
 * GEO readiness self-check (Okara-inspired follow-up, scoped honestly). Real
 * cross-engine AI-citation tracking (does ChatGPT/Perplexity/Gemini actually
 * cite this) needs a paid third-party API and querying each engine directly
 * — not built here, that's a real vendor decision like Brand24 was for SOV.
 *
 * What this is instead: a rule-based check of the things that actually make
 * a direct-answer piece more likely to be extracted and cited — computed
 * from bimark's own content, free, and defensible, just not the same claim.
 */
export interface GeoCheck {
  label: string;
  pass: boolean;
}
export interface GeoReadiness {
  score: number; // 0-100, percentage of checks passed
  checks: GeoCheck[];
}

const HEDGE_OPENERS = /^(in today's|let's explore|this article|welcome to|have you ever|it's no secret)/i;
const BAIT_PATTERNS = [/agree\?/i, /comment below/i, /thoughts\? ?👇/i, /like if you/i];

export function computeGeoReadiness(body: string, claimsUsed: string[] | null): GeoReadiness {
  const text = (body ?? "").trim();
  const words = text.split(/\s+/).filter(Boolean);
  const firstSentence = (text.match(/^[^.!?]*[.!?]/)?.[0] ?? text).trim();
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const longestParagraphWords = Math.max(0, ...paragraphs.map((p) => p.split(/\s+/).filter(Boolean).length));

  const checks: GeoCheck[] = [
    {
      label: "150-400 words — enough to be substantive, not so long it's unquotable whole",
      pass: words.length >= 150 && words.length <= 400,
    },
    {
      label: "Opens with a direct answer, not a hedge or a hook",
      pass: firstSentence.length > 0 && firstSentence.length <= 220 && !HEDGE_OPENERS.test(firstSentence),
    },
    {
      label: "Every claim is traced back to a source",
      pass: Array.isArray(claimsUsed) && claimsUsed.length > 0,
    },
    {
      label: "No engagement-bait phrasing (this is meant to be quoted, not liked)",
      pass: !BAIT_PATTERNS.some((p) => p.test(text)),
    },
    {
      label: "Short paragraphs — each makes one point a crawler can extract cleanly",
      pass: paragraphs.length === 0 || longestParagraphWords <= 90,
    },
  ];

  const score = Math.round((checks.filter((c) => c.pass).length / checks.length) * 100);
  return { score, checks };
}
