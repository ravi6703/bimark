import { config } from "../config.js";
import type { GeoExtra, InstagramExtra, LinkedInExtra, PlatformExtra, XExtra, YoutubeExtra } from "../types.js";

/**
 * Every channel bimark can produce for. Adding one means adding a definition
 * below and a key here — not editing eight call sites.
 */
export type PlatformKey = "linkedin" | "x" | "instagram" | "geo" | "youtube";

export interface PlatformDef {
  key: PlatformKey;
  /** Human-facing name, e.g. in Telegram messages. */
  label: string;
  /** The format/limits fragment spliced into the repurpose prompt (§17.3). */
  spec: string;
  /**
   * The channel-specific item 6 on the brand-safety reviewer's checklist
   * (§17.4) — the format rule most worth blocking a draft over.
   */
  reviewCheck: string;
  /**
   * Turns this channel's structured guidance (topics.platform_extra, §20) into
   * a plain-language instruction the draft prompt already understands.
   * Returns null when there's nothing extra to say — Instagram's guidance is
   * visual-only and applies to the image prompt instead.
   */
  guidance(extra: PlatformExtra | null): string | null;
  /**
   * How many images WF-4 generates and attaches before review. A getter, not a
   * constant, because LinkedIn's count is configurable at runtime.
   */
  imageCount(): number;
  /** Shape of any generated image. Only meaningful when imageCount() > 0. */
  imageAspect: "square" | "landscape";
  /**
   * Hard character ceiling the platform itself enforces, if any. Applied in
   * code as well as in the prompt — LLMs occasionally overshoot and the
   * publisher would reject the post.
   */
  maxChars?: number;
  /** Instagram can't post text-only — publish refuses without media. */
  requiresMedia: boolean;
  /**
   * Whether a "post to this platform" API exists. false means approval hands
   * the text back to a human to place, who then marks it posted.
   */
  autoPublish: boolean;
  /** Explains, on approval, what to do instead. Required when !autoPublish. */
  manualPublishNote?: string;
  /** The publisher's own name for this channel, when it differs from `key`. */
  publishAs?: string;
}

const LINKEDIN: PlatformDef = {
  key: "linkedin",
  label: "LinkedIn",
  reviewCheck:
    "6. Fits the platform's length norm (roughly 150-250 words for LinkedIn, a short caption for Instagram) " +
    "and reads as a strong draft a human will finish, not as finished AI copy.",
  // Move 4 — LinkedIn now demotes content it detects as AI-generated (reported
  // at up to ~47% less reach) while organic reach is down roughly half year on
  // year. Aiming for a publish-ready post is therefore aiming at the thing the
  // algorithm penalises. The brief asks instead for a strongly-structured draft
  // that visibly wants a human line, which is both better for reach and closer
  // to how the team actually works — the reviewer's edit is the product's
  // value, not its overhead. The 120-200 word floor also undershot what the
  // format rewards, hence 150-250.
  spec: `PLATFORM: LinkedIn. 150-250 words. No hashtag spam (max 3, relevant).
This is a DRAFT a senior human will finish, not a finished post. Write it so
their edit is easy and obvious:
- Open on the specific insight or number, never on a throat-clearing sentence
  ("In today's fast-changing world", "I've been thinking about...").
- Vary sentence length. Avoid the tell-tale rhythm of uniform medium-length
  sentences and tidy tricolons.
- Leave exactly one clearly-marked gap for the human's own line, on its own
  line, written as: [YOUR TAKE: <a specific prompt for what only they can add —
  a first-hand observation, a client moment, a disagreement>].
- No summarising final paragraph that restates the post. End on the substance.`,
  guidance(extra) {
    const { audience, cta } = (extra ?? {}) as LinkedInExtra;
    return (
      [
        audience ? `Write for this audience: ${audience}.` : "",
        cta ? `End with this call to action: ${cta}.` : "",
      ]
        .filter(Boolean)
        .join(" ") || null
    );
  },
  // A multi-image post reads as a real carousel rather than a wall of text.
  imageCount: () => config.image.linkedinImageCount,
  imageAspect: "landscape",
  requiresMedia: false,
  autoPublish: true,
};

const X: PlatformDef = {
  key: "x",
  label: "X",
  reviewCheck:
    "6. Is <=280 characters total (X's hard limit).",
  spec: `PLATFORM: X (Twitter). A single post, <=280 characters INCLUDING spaces
and any hashtags. One sharp idea, not a summary of the LinkedIn version.
At most 1 hashtag. No thread — one post only.`,
  guidance(extra) {
    switch (((extra ?? {}) as XExtra).angleStyle) {
      case "hot-take":
        return "Take a provocative, opinionated stance — don't hedge.";
      case "question":
        return "Frame it as a genuine question to the audience, not a statement.";
      case "informative":
        return "Keep it purely informative — no hot take, no question, just the insight.";
      default:
        return null;
    }
  },
  imageCount: () => 0,
  imageAspect: "square",
  maxChars: 280,
  requiresMedia: false,
  autoPublish: true,
  // Ayrshare kept "twitter" as the platform identifier after the X rebrand.
  publishAs: "twitter",
};

const INSTAGRAM: PlatformDef = {
  key: "instagram",
  label: "Instagram",
  reviewCheck:
    "6. Fits the platform's length norm (roughly 120-200 words for LinkedIn, a short caption for Instagram).",
  spec: `PLATFORM: Instagram caption. 3-6 short lines, warmer and more direct than
LinkedIn but still credible (never hype-y). End with up to 5 relevant,
specific hashtags (no generic tags like #motivation). This is a CAPTION —
assume an image/carousel accompanies it; do not describe a nonexistent visual.`,
  // Instagram's guidance is visual-only — it shapes the image prompt (see
  // visualNotesFor), never the copy.
  guidance: () => null,
  imageCount: () => 1,
  imageAspect: "square",
  requiresMedia: true,
  autoPublish: true,
};

const GEO: PlatformDef = {
  key: "geo",
  label: "GEO",
  reviewCheck:
    "6. Opens with a direct, complete answer to the target question in the first sentence; 150-400 words; every claim is independently checkable against the source — this will be quoted as fact.",
  spec: `PLATFORM: none — this is GEO content (generative-engine optimization): a
direct-answer piece written to be found and cited by AI answer engines
(ChatGPT, Perplexity, AI Overviews), not posted to a social feed. Structure:
- Open with the target question as a heading, then answer it in the FIRST
  sentence, plainly and completely — assume the reader/crawler only ever
  sees that first sentence.
- 150-400 words. Plain factual prose, not persuasion — no hooks, no CTAs,
  no hashtags, no engagement bait. Short paragraphs, each making one point.
- Every factual claim must be independently checkable against the source
  material — this is written to be QUOTED as fact, so it must earn that.`,
  guidance(extra) {
    const { targetQuestion } = (extra ?? {}) as GeoExtra;
    return targetQuestion ? `Directly answer this question: ${targetQuestion}` : null;
  },
  imageCount: () => 0,
  imageAspect: "square",
  requiresMedia: false,
  autoPublish: false,
  manualPublishNote:
    "this is GEO content, so there's no platform to auto-publish to. Copy it into your CMS/blog from the dashboard, then mark it posted.",
};

const YOUTUBE: PlatformDef = {
  key: "youtube",
  label: "YouTube",
  reviewCheck:
    "6. Has a TITLE, HOOK, numbered TALKING POINTS, and a CTA section; reads like something spoken aloud, not written prose; every talking point is grounded in the source material.",
  spec: `PLATFORM: YouTube script/outline. There is no video-generation pipeline here —
this is a SCRIPT for a human to shoot, not a finished video. Structure it as:
TITLE: a specific, searchable title (not clickbait).
HOOK: the first 10-15 seconds, spoken, that earns a viewer staying past the intro.
TALKING POINTS: 3-5 numbered points, each one concrete idea grounded in the
  source material, in the order they'd be spoken.
CTA: one line, low-pressure (e.g. "more on this in our resources").
Plain spoken language, not written prose — short sentences a person can say
out loud. No hashtags.`,
  guidance(extra) {
    switch (((extra ?? {}) as YoutubeExtra).videoAngle) {
      case "tutorial":
        return "Structure it as a step-by-step tutorial — numbered, actionable steps.";
      case "explainer":
        return "Structure it as a concept explainer — build understanding, not a how-to.";
      case "interview-clip":
        return "Write it as talking points for a short interview-style clip, not a monologue.";
      default:
        return null;
    }
  },
  imageCount: () => 0,
  imageAspect: "square",
  requiresMedia: false,
  autoPublish: false,
  manualPublishNote:
    "this is a video script, not a finished video — shoot and upload it yourself, then mark it posted.",
};

const REGISTRY: Record<PlatformKey, PlatformDef> = {
  linkedin: LINKEDIN,
  x: X,
  instagram: INSTAGRAM,
  geo: GEO,
  youtube: YOUTUBE,
};

export const PLATFORM_KEYS = Object.keys(REGISTRY) as PlatformKey[];

/** Every channel, in registry order — for building enums, tabs and filters. */
export const PLATFORMS: PlatformDef[] = PLATFORM_KEYS.map((k) => REGISTRY[k]);

export function isPlatformKey(p: string): p is PlatformKey {
  return p in REGISTRY;
}

/**
 * The definition for a platform string, falling back to LinkedIn for anything
 * unrecognised — same default the pipeline has always applied to a topic whose
 * platform column holds something unexpected.
 */
export function platformFor(p: string): PlatformDef {
  return isPlatformKey(p) ? REGISTRY[p] : LINKEDIN;
}

/**
 * Brand visual notes plus this channel's own visual guidance, for the image
 * prompt. Only Instagram contributes anything today; kept here so a future
 * channel with its own visual style has an obvious place to add it.
 */
export function visualNotesFor(
  platform: string,
  brandVisualNotes: string | null | undefined,
  extra: PlatformExtra | null,
): string | null {
  const parts: string[] = [];
  if (brandVisualNotes) parts.push(brandVisualNotes);
  if (platformFor(platform).key === "instagram") {
    const { visualStyle } = (extra ?? {}) as InstagramExtra;
    if (visualStyle) parts.push(`Visual style: ${visualStyle}.`);
  }
  return parts.join(" ") || null;
}

/** Enforce a channel's hard character ceiling, if it has one. */
export function capForPlatform(platform: string, text: string): string {
  const max = platformFor(platform).maxChars;
  if (max === undefined || text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
