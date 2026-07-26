import { getLlm, parseJson } from "../llm/index.js";
import type { LlmProvider } from "../llm/types.js";
import type { BrandProfileProposal } from "../types.js";
import { onboardingPrompt } from "./prompts.js";

/**
 * AI-derived onboarding (Okara-inspired). Fetches a company's public site and
 * extracts plain text — homepage only for this first pass; multi-page
 * crawling (pricing, about) is a reasonable follow-up, not claimed here.
 */
export async function fetchPageText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; bimark-onboarding/1.0)" },
  });
  if (!res.ok) throw new Error(`failed to fetch ${url}: ${res.status}`);
  const html = await res.text();
  return htmlToText(html);
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Proposes a starting brand profile from a company's own public site text.
 * A proposal only — nothing here writes to the DB; the caller (dashboard)
 * shows this for the human to review/edit before applying via the existing
 * brand/pillar CRUD endpoints.
 */
export async function proposeBrandProfile(
  input: { url: string; pageText: string },
  llm: LlmProvider = getLlm(),
): Promise<BrandProfileProposal> {
  const { system, user } = onboardingPrompt(input);
  const res = await llm.complete({
    task: "onboarding",
    system,
    messages: [{ role: "user", content: user }],
    json: true,
    maxTokens: 1200,
    mockResult: JSON.stringify(mockProposal(input.url)),
  });
  const parsed = parseJson<Partial<BrandProfileProposal>>(res.text, "onboarding");
  return {
    voiceGuide: parsed.voiceGuide ?? "",
    visualNotes: parsed.visualNotes ?? "",
    bannedTopics: Array.isArray(parsed.bannedTopics) ? parsed.bannedTopics : [],
    pillars: Array.isArray(parsed.pillars) ? parsed.pillars : [],
  };
}

/** Deterministic offline proposal so onboarding is demonstrable with no LLM key. */
function mockProposal(url: string): BrandProfileProposal {
  return {
    voiceGuide:
      `[mock proposal for ${url} — connect a real LLM to generate this from the ` +
      "site's actual text] Audience: this site's stated customers. Personality: " +
      "confident, specific, grounded in what the product actually does.",
    visualNotes: "Clean, modern, editorial — matches the site's own visual register.",
    bannedTopics: [],
    pillars: [
      { name: "Core offering", description: "What the homepage says the product does" },
      { name: "Customer outcomes", description: "Results or case studies mentioned on the site" },
    ],
  };
}
