import { getLlm, parseJson } from "../llm/index.js";
import type { LlmProvider } from "../llm/types.js";
import type { ReviewerResult, RetrievedChunk } from "../types.js";
import { reviewerPrompt } from "./prompts.js";

/**
 * Brand-Safety Reviewer (§10 / §17.4) — the hard gate before the human. Runs on
 * the strong model tier (§20). Returns a structured verdict; a "flag" sends the
 * draft back for a rewrite (WF-4.4) rather than to Telegram.
 */
export async function review(
  input: {
    draft: string;
    claimsUsed: string[];
    chunks: RetrievedChunk[];
    bannedTopics: string[];
    voiceGuide: string;
  },
  llm: LlmProvider = getLlm(),
): Promise<ReviewerResult> {
  const { system, user } = reviewerPrompt({
    draft: input.draft,
    claimsUsed: JSON.stringify(input.claimsUsed),
    retrievedChunks: input.chunks
      .map((c, i) => `[S${i + 1}] ${(c.chunk_text ?? "").trim()}`)
      .join("\n\n"),
    bannedTopics: input.bannedTopics.join(", ") || "(none configured)",
    voiceGuide: input.voiceGuide,
  });

  const res = await llm.complete({
    task: "review",
    system,
    messages: [{ role: "user", content: user }],
    json: true,
    temperature: 0,
    maxTokens: 512,
    mockResult: JSON.stringify(heuristicReview(input)),
  });

  const parsed = parseJson<ReviewerResult>(res.text, "reviewer");
  return {
    verdict: parsed.verdict === "flag" ? "flag" : "pass",
    flags: Array.isArray(parsed.flags) ? parsed.flags : [],
    notes: typeof parsed.notes === "string" ? parsed.notes : "",
  };
}

/**
 * Offline heuristic gate so brand safety is enforced even without an LLM: catches
 * banned topics, engagement-bait, and obvious buzzword salad. Deliberately
 * conservative — a real reviewer LLM is stricter, this is a floor, not a ceiling.
 */
export function heuristicReview(input: {
  draft: string;
  bannedTopics: string[];
}): ReviewerResult {
  const flags: string[] = [];
  const text = input.draft.toLowerCase();

  for (const topic of input.bannedTopics) {
    if (topic && text.includes(topic.toLowerCase())) flags.push(`banned topic: ${topic}`);
  }
  const baitPatterns = [/agree\?/i, /comment below/i, /thoughts\? ?👇/i, /like if you/i];
  if (baitPatterns.some((p) => p.test(input.draft))) flags.push("engagement-bait detected");

  const buzzwords = ["synergy", "revolutionary", "game-changer", "game changer", "disrupt"];
  if (buzzwords.some((w) => text.includes(w))) flags.push("buzzword salad detected");

  return {
    verdict: flags.length > 0 ? "flag" : "pass",
    flags,
    notes: flags.length > 0 ? `Fix: ${flags.join("; ")}` : "heuristic: no issues found",
  };
}
