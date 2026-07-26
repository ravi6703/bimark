import { getLlm } from "../llm/index.js";

export interface CitationCheckResult {
  mentioned: boolean;
  excerpt: string;
  modelUsed: string;
}

const EXCERPT_LIMIT = 600;

/**
 * GEO citation tracking (Okara-comparison follow-up) — the honest cousin of
 * src/geo/readiness.ts's rule-based check. That file explicitly declines to
 * claim cross-engine citation tracking without a paid API per engine; this
 * covers the one engine bimark can genuinely query for free, since
 * ANTHROPIC_API_KEY is already configured for the app's own generation —
 * not a new vendor decision. ChatGPT/Perplexity are deliberately not built
 * yet — they'd need their own OPENAI_API_KEY/PERPLEXITY_API_KEY and real
 * per-query cost, a call for the user to make, not to invent a fake result
 * for. Adding one later just means a new engine value alongside "claude"
 * wherever this is called from (src/workflows/wf9_geoCitationCheck.ts).
 *
 * Sends the probe question exactly as a neutral, unprompted user would, then
 * checks whether the brand's own name shows up in the real answer. This is
 * that one engine's actual answer — never a synthesized/estimated score.
 */
export async function checkCitation(queryText: string, brandName: string): Promise<CitationCheckResult> {
  const result = await getLlm().complete({
    task: "geo_probe",
    system:
      "You are a helpful, neutral assistant answering a general informational question. Answer " +
      "naturally, exactly as you would for any user — don't mention or favor any particular company " +
      "unless it's genuinely relevant to a complete, well-informed answer.",
    messages: [{ role: "user", content: queryText }],
    maxTokens: 500,
  });
  const mentioned = brandMentioned(result.text, brandName);
  return {
    mentioned,
    excerpt: result.text.slice(0, EXCERPT_LIMIT),
    modelUsed: result.modelUsed,
  };
}

/** Exported for testing — a whole-word, case-insensitive substring check. */
export function brandMentioned(text: string, brandName: string): boolean {
  const trimmed = brandName.trim();
  if (!trimmed) return false;
  return new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, "i").test(text);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
