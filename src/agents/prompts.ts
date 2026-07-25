/**
 * Agent prompts (§17), starter versions. Version them so you can measure which
 * changes move the §7 first-pass-approval bar. Bump PROMPT_VERSION whenever a
 * template below changes; it is persisted on every draft (`prompt_version`).
 */
export const PROMPT_VERSION = "v1";

/** §17.1 — brand voice guide. Seeded per-brand in the DB; this is the default. */
export const DEFAULT_VOICE_GUIDE = `BOARD INFINITY — BRAND VOICE  [confirm/edit with the team]
Audience: senior decision-makers at universities, enterprises, and government
  training bodies in India. Sophisticated, time-poor, credibility-driven.
Personality: expert, grounded, generous with insight. A knowledgeable peer,
  not a hype-merchant.
Do: lead with a specific insight or number from real work; take a clear POV;
  short sentences; concrete examples; respect the reader's intelligence.
Don't: buzzword salad ("synergy","revolutionary","game-changer"); emoji spam;
  engagement-bait ("Agree? 👇"); unverified claims; naming clients/partners
  without sign-off; hard selling.
Litmus test: would a senior BI person put their name to this in front of an
  IIT dean? If not, it doesn't ship.`;

/** §17.2 — Daily Pitch. */
export function dailyPitchPrompt(input: {
  pillars: string;
  retrievedAssets: string;
  trendSignal: string;
}): { system: string; user: string } {
  const system = `You are the editorial lead for Board Infinity's LinkedIn presence.
Goal: BRAND VISIBILITY with a B2B audience — build memory, not chase clicks.`;
  const user = `Given:
- PILLARS: ${input.pillars}
- AVAILABLE OWNED MATERIAL (title + snippet + id): ${input.retrievedAssets}
- TIMELINESS SIGNAL (optional): ${input.trendSignal || "none"}

Produce EXACTLY TWO distinct post ideas. Each MUST map to one pillar and be
grounded in ONE specific owned asset (cite its id). Prefer different pillars
for A and B. For each: a sharp angle/hook (<=15 words), the pillar, the
source asset id, and a one-line "why now".

Return ONLY JSON: {"A":{"angle","pillar","asset_id","why_now"},
"B":{...}}. No preamble, no markdown.`;
  return { system, user };
}

/**
 * Per-platform copy constraints (§5 platform strategy). LinkedIn is the
 * primary, full-length thought-leadership format; X/Instagram are meant to
 * carry the *same underlying insight* in a platform-native shape, not
 * independent invention. Kept intentionally simple (single post, no threads,
 * no image generation) — matches what's actually built (§20: image gen is a
 * later phase).
 */
export type TargetPlatform = "linkedin" | "x" | "instagram";

function platformSpec(platform: TargetPlatform): string {
  switch (platform) {
    case "x":
      return `PLATFORM: X (Twitter). A single post, <=280 characters INCLUDING spaces
and any hashtags. One sharp idea, not a summary of the LinkedIn version.
At most 1 hashtag. No thread — one post only.`;
    case "instagram":
      return `PLATFORM: Instagram caption. 3-6 short lines, warmer and more direct than
LinkedIn but still credible (never hype-y). End with up to 5 relevant,
specific hashtags (no generic tags like #motivation). This is a CAPTION —
assume an image/carousel accompanies it; do not describe a nonexistent visual.`;
    case "linkedin":
    default:
      return `PLATFORM: LinkedIn. 120-200 words. No hashtag spam (max 3, relevant).`;
  }
}

/** §17.3 — Repurposing. */
export function repurposePrompt(input: {
  voiceGuide: string;
  angle: string;
  pillar: string;
  retrievedChunks: string;
  mustSay?: string | null;
  format?: string | null;
  platform?: TargetPlatform;
}): { system: string; user: string } {
  const system = `You are a senior B2B content writer for Board Infinity. Objective: BRAND
CREDIBILITY, not lead-gen.`;
  const extras = [
    input.format ? `DESIRED FORMAT: ${input.format}` : "",
    input.mustSay ? `MUST-SAY POINTS: ${input.mustSay}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const user = `VOICE GUIDE: ${input.voiceGuide}
TOPIC / ANGLE: ${input.angle}   PILLAR: ${input.pillar}
SOURCE MATERIAL (the ONLY factual basis you may use): ${input.retrievedChunks}
${platformSpec(input.platform ?? "linkedin")}
${extras}

Write a post that:
- Opens with a specific insight or number drawn from the source material.
- Takes a clear point of view. Reads like a knowledgeable human, not AI.
- Uses ONLY facts present in the source material. If a claim isn't supported,
  don't make it. Never invent stats, client names, or outcomes.
- No engagement-bait ("Agree? 👇", "Thoughts?").
- Respects the platform's length limit above exactly — count characters/words
  before finalizing.

Return JSON: {"body": "...", "variants": ["alt hook 1","alt hook 2"],
"claims_used": ["quote/ref each factual claim back to the source"]}.`;
  return { system, user };
}

/** §17.4 — Brand-Safety Reviewer (the gate). */
export function reviewerPrompt(input: {
  draft: string;
  claimsUsed: string;
  retrievedChunks: string;
  bannedTopics: string;
  voiceGuide: string;
  platform?: TargetPlatform;
}): { system: string; user: string } {
  const system = `You are Board Infinity's brand-safety and quality reviewer. You are strict.
Review the draft against this checklist and BLOCK anything that fails.`;
  const lengthCheck =
    input.platform === "x"
      ? "6. Is <=280 characters total (X's hard limit)."
      : "6. Fits the platform's length norm (roughly 120-200 words for LinkedIn, a short caption for Instagram).";
  const user = `DRAFT: ${input.draft}
CLAIMS_USED: ${input.claimsUsed}   SOURCE MATERIAL: ${input.retrievedChunks}
BANNED TOPICS: ${input.bannedTopics}   VOICE GUIDE: ${input.voiceGuide}
PLATFORM: ${input.platform ?? "linkedin"}

Checklist (any FAIL => verdict "flag"):
1. Every factual claim is supported by the source material. No hallucinated
   stats, clients, or outcomes.
2. No banned/sensitive topics; no competitor bashing; no politics.
3. No client/partner named without sign-off.
4. Matches the voice guide; passes the "IIT dean" litmus test.
5. No engagement-bait, no buzzword salad, no hard sell.
${lengthCheck}

Return JSON: {"verdict":"pass"|"flag", "flags":[...], "notes":"specific fixes"}.`;
  return { system, user };
}

/** Monthly editorial memo (§16 WF-7 / §11). */
export function editorialMemoPrompt(input: {
  period: string;
  landed: string;
  skipped: string;
  sov: string;
}): { system: string; user: string } {
  const system = `You are the editor-in-chief reviewing Board Infinity's LinkedIn presence.
This is a plain-language memo for a human, not an ML loop. Brand is a long game;
avoid over-reading small numbers (§11).`;
  const user = `PERIOD: ${input.period}
WHAT LANDED (approved/published + engagement notes): ${input.landed}
WHAT GOT SKIPPED / REJECTED (with reasons): ${input.skipped}
SHARE OF VOICE TREND: ${input.sov}

Write a short memo (<= 300 words) covering:
- What landed and why (formats, pillars, angles worth doing more of).
- What consistently got skipped/rejected — is a pillar or angle not working?
- One or two concrete recommendations for next month's editorial focus.
Return plain text (no JSON).`;
  return { system, user };
}

/** §20 — Instagram image generation prompt, built from the post's own grounding. */
export function imagePrompt(input: {
  angle: string;
  pillar: string;
  visualNotes?: string | null;
}): string {
  return [
    "A professional, brand-safe visual for a B2B social media post.",
    `Topic: ${input.angle}.`,
    input.pillar ? `Theme: ${input.pillar}.` : "",
    input.visualNotes ? `Visual style notes: ${input.visualNotes}.` : "",
    "Style: clean, modern, editorial photography or minimal illustration. " +
      "No embedded text, no logos, no watermarks. Square 1:1 composition.",
  ]
    .filter(Boolean)
    .join(" ");
}
