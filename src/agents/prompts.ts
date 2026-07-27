import { platformFor, type PlatformKey } from "../platforms/index.js";
import type { PillarIntent } from "../types.js";
/**
 * Agent prompts (§17), starter versions. Version them so you can measure which
 * changes move the §7 first-pass-approval bar. Bump PROMPT_VERSION whenever a
 * template below changes; it is persisted on every draft (`prompt_version`).
 */
export const PROMPT_VERSION = "v2";

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
/**
 * Re-exported from the platform registry so existing importers keep working —
 * src/platforms is now the single place a channel is defined.
 */
export type TargetPlatform = PlatformKey;

/** §17.3 — Repurposing. */
export function repurposePrompt(input: {
  voiceGuide: string;
  angle: string;
  pillar: string;
  retrievedChunks: string;
  mustSay?: string | null;
  format?: string | null;
  platform?: TargetPlatform;
  /** Recent angles already covered for this pillar+platform (§20 follow-up,
   * "show previous data") — steers the model away from repeating itself,
   * on top of the after-the-fact distinctiveness guard. */
  recentAngles?: string[];
  /**
   * What this pillar is FOR (Move 4, migration 019). Defaults to 'authority',
   * which reproduces the original credibility-only instruction verbatim — so
   * nothing changes for an existing pillar until someone deliberately marks
   * one 'conversion'.
   */
  pillarIntent?: PillarIntent;
  /** Where a 'conversion' pillar should point the reader. Ignored otherwise. */
  conversionTarget?: string | null;
}): { system: string; user: string } {
  // Move 4 — the objective is now per-pillar rather than one answer for the
  // whole product. Credibility content that never offers a next step generates
  // no attributable inbound; CTA-stuffed content destroys the credibility that
  // makes the inbound worth having. Pillars decide which trade they're making.
  const system =
    input.pillarIntent === "conversion"
      ? `You are a senior B2B content writer for Board Infinity. Objective: BRAND
CREDIBILITY that earns a next step. Credibility comes first and is
non-negotiable — the post must stand on its own insight even if the reader
never clicks. Exactly ONE next step, offered once, at the end, in a plain
sentence. Never engagement-bait, never urgency, never "DM me".`
      : `You are a senior B2B content writer for Board Infinity. Objective: BRAND
CREDIBILITY, not lead-gen. Do not include a call to action.`;
  const extras = [
    input.format ? `DESIRED FORMAT: ${input.format}` : "",
    input.mustSay ? `MUST-SAY POINTS: ${input.mustSay}` : "",
    input.pillarIntent === "conversion" && input.conversionTarget
      ? `NEXT STEP TO OFFER (once, at the end, plainly): ${input.conversionTarget}`
      : "",
    input.recentAngles?.length
      ? `RECENTLY COVERED ON THIS PLATFORM/PILLAR (find a genuinely new angle, don't rehash these):\n- ${input.recentAngles.join("\n- ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const user = `VOICE GUIDE: ${input.voiceGuide}
TOPIC / ANGLE: ${input.angle}   PILLAR: ${input.pillar}
SOURCE MATERIAL (the ONLY factual basis you may use): ${input.retrievedChunks}
${platformFor(input.platform ?? "linkedin").spec}
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
  const lengthCheck = platformFor(input.platform ?? "linkedin").reviewCheck;
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

/**
 * §20 — pre-draft clarity check. Runs before repurpose() so a vague topic
 * gets 1-2 sharp questions instead of a generic, unconvincing draft.
 */
export function clarifyPrompt(input: {
  topic: string;
  platforms: string[];
  mustSay?: string;
  whyNow?: string;
}): { system: string; user: string } {
  const system = `You are an editorial assistant deciding whether there's enough specific
detail to draft a credible, grounded social post right now, or whether the
operator needs to be asked first. Default to "sufficient" — only ask when a
draft would otherwise clearly be generic or ungrounded. Never ask more than
2 questions, and only about what's genuinely missing (a concrete example,
a target audience, a timeframe, a stance) — not busywork.`;
  const user = `TOPIC: ${input.topic}
TARGET PLATFORMS: ${input.platforms.join(", ")}
MUST-SAY POINTS: ${input.mustSay || "(none given)"}
WHY NOW: ${input.whyNow || "(none given)"}

Return ONLY JSON:
{"sufficient": true} — if this is specific enough to draft from as-is, OR
{"sufficient": false, "questions": [{"platform": "linkedin", "question": "..."}]}
  — at most 2 questions total, each tied to a specific platform, short and
  concrete. No preamble, no markdown.`;
  return { system, user };
}

/**
 * AI-derived onboarding (Okara-inspired). Reads a company's own public site
 * text and proposes a starting brand profile — pillars, voice guide, banned
 * topics — instead of requiring someone to hand-author it from a blank page.
 * A proposal only: the human reviews and edits before anything is applied
 * (see api/onboarding/propose.ts — nothing here writes to the DB).
 */
export function onboardingPrompt(input: {
  url: string;
  pageText: string;
}): { system: string; user: string } {
  const system = `You are a B2B brand strategist setting up a new client's content
strategy from scratch. You have one source of truth: their own public
website text. Propose a grounded starting point, not a generic template —
name pillars from what THIS company actually says it does, not boilerplate
"innovation" or "excellence" pillars.`;
  const user = `COMPANY URL: ${input.url}
PUBLIC SITE TEXT (homepage, best-effort extraction): ${input.pageText.slice(0, 6000)}

Propose:
1. A voice guide (like a brand style sheet): audience, personality, a
   handful of do's/don'ts, one memorable "litmus test" sentence for whether
   a post is on-brand.
2. Visual notes: a short description of the visual style content should use.
3. Banned topics: obvious sensitive/off-limits topics for this specific
   company (competitors it shouldn't bash, claims it can't make, etc.) —
   infer from context, don't invent specifics you can't see evidence for.
4. 3-5 content pillars: named from THIS company's actual stated focus areas,
   each with a one-line description of what it covers.

Return ONLY JSON: {"voiceGuide":"...", "visualNotes":"...",
"bannedTopics":["..."], "pillars":[{"name":"...","description":"..."}]}.
No preamble, no markdown.`;
  return { system, user };
}

/**
 * §20 — post-image generation prompt, built from the post's own grounding.
 * Originally Instagram-only (hence the square default); LinkedIn multi-image
 * follow-up adds an aspect-ratio switch and an optional per-image variation
 * hint so a multi-image carousel doesn't generate the same picture N times.
 * "No logos, no watermarks" is deliberate even though the brand logo does get
 * added — that happens as a precise post-generation composite (see
 * src/images/watermark.ts), not by asking the model to draw one, which it
 * would render inaccurately.
 */
export function imagePrompt(input: {
  angle: string;
  pillar: string;
  visualNotes?: string | null;
  /** Shape of the image — comes from the channel's registry entry. */
  aspect?: "square" | "landscape";
  variationHint?: string | null;
}): string {
  const composition =
    input.aspect === "landscape" ? "Landscape 1.91:1 composition." : "Square 1:1 composition.";
  return [
    "A professional, brand-safe visual for a B2B social media post.",
    `Topic: ${input.angle}.`,
    input.pillar ? `Theme: ${input.pillar}.` : "",
    input.visualNotes ? `Visual style notes: ${input.visualNotes}.` : "",
    input.variationHint ? input.variationHint : "",
    "Style: clean, modern, editorial photography or minimal illustration. " +
      `No embedded text, no logos, no watermarks. ${composition}`,
  ]
    .filter(Boolean)
    .join(" ");
}
