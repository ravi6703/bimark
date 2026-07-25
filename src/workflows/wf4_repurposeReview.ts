import { config } from "../config.js";
import { logger } from "../logger.js";
import { repurpose } from "../agents/repurpose.js";
import { review } from "../agents/reviewer.js";
import { DEFAULT_VOICE_GUIDE, imagePrompt, type TargetPlatform } from "../agents/prompts.js";
import { brands, drafts, mediaAssets, ownedAssets, pillars, topics } from "../db/repositories/index.js";
import { buildMediaUrl, getImageGenerator } from "../images/index.js";
import { retrieve } from "../rag/retrieve.js";
import { getTelegram } from "../telegram/client.js";
import { draftPreviewMessage } from "../telegram/messages.js";
import type {
  Draft,
  InstagramExtra,
  LinkedInExtra,
  ReviewerResult,
  RetrievedChunk,
  Topic,
  XExtra,
} from "../types.js";

/**
 * WF-4 · Repurpose & Review → Draft (§16). Called by WF-2 (pitch pick) and WF-3
 * (manual intake). Same gate for both paths — no fast lane (§4.2).
 *
 *   retrieve owned material → draft → brand-safety review (loop on flag) →
 *   persist draft → Telegram approval preview.
 */
export async function runRepurposeReview(topicId: number): Promise<Draft> {
  const topic = await topics.get(topicId);
  if (!topic) throw new Error(`WF-4: topic ${topicId} not found`);

  const brand = await brands.get(topic.brand_id);
  const voiceGuide = brand?.voice_guide ?? DEFAULT_VOICE_GUIDE;
  const bannedTopics = brand?.banned_topics ?? [];
  const pillarName = await resolvePillarName(topic);
  const platform = normalizePlatform(topic.platform);

  await topics.setStatus(topic.id, "drafting");

  // Step 1 — gather grounding chunks (§16 WF-4.1).
  const { chunks, lowSource } = await gatherChunks(topic);

  // Step 1b — fold structured per-platform guidance (§20) into the free-text
  // must-say the draft prompt already understands, rather than growing the
  // prompt builder's parameter list per platform.
  const mustSay = [topic.must_say, extraGuidance(platform, topic.platform_extra)]
    .filter(Boolean)
    .join(" ") || undefined;

  // Step 2 — repurpose into a draft.
  let draftOut = await repurpose({
    voiceGuide,
    angle: topic.angle ?? "",
    pillar: pillarName,
    chunks,
    mustSay,
    format: topic.format_hint,
    platform,
  });

  // Step 3 & 4 — brand-safety review loop; escalate if persistently flagged.
  let reviewer: ReviewerResult | null = null;
  let retries = 0;
  const maxRetries = config.quality.maxReviewRetries;
  while (retries <= maxRetries) {
    reviewer = await review({
      draft: draftOut.body,
      claimsUsed: draftOut.claims_used,
      chunks,
      bannedTopics,
      voiceGuide,
      platform,
    });
    if (reviewer.verdict === "pass") break;

    retries++;
    if (retries > maxRetries) {
      logger.warn({ topicId, flags: reviewer.flags }, "WF-4: escalating persistently-flagged draft");
      break; // escalate to the human with the flag reason attached
    }
    logger.info({ topicId, retry: retries, flags: reviewer.flags }, "WF-4: reviewer flagged, rewriting");
    draftOut = await repurpose({
      voiceGuide,
      angle: `${topic.angle ?? ""} (revise to fix: ${reviewer.notes})`,
      pillar: pillarName,
      chunks,
      mustSay,
      format: topic.format_hint,
      platform,
    });
  }

  // Step 5 — persist the draft.
  const draft = await drafts.create({
    topic_id: topic.id,
    platform: topic.platform,
    body: draftOut.body,
    variants: draftOut.variants,
    claims_used: draftOut.claims_used,
    low_source: lowSource,
    model_used: draftOut.modelUsed,
    prompt_version: draftOut.promptVersion,
    reviewer_result: reviewer,
    review_retries: retries,
    status: "pending_approval",
  });
  await topics.setStatus(topic.id, "drafted");

  // Step 5b — Instagram can't post text-only (§20); generate + attach its image now
  // so the draft arrives in review already postable, no manual URL step.
  if (platform === "instagram") {
    const visualStyle = (topic.platform_extra as InstagramExtra | null)?.visualStyle;
    const visualNotes = [brand?.visual_notes, visualStyle ? `Visual style: ${visualStyle}.` : null]
      .filter(Boolean)
      .join(" ") || null;
    await attachGeneratedImage(draft, topic.angle ?? "", pillarName, visualNotes);
  }

  // Step 6 — Telegram approval preview (§9 gate). Send the generated image
  // as a photo (caption = preview text) when one is attached, so the editor
  // can see what will actually post to Instagram before approving.
  const { text, buttons } = draftPreviewMessage(draft);
  if (draft.media_asset_id != null) {
    await getTelegram().sendPhoto({
      photoUrl: buildMediaUrl(draft.media_asset_id),
      caption: text,
      buttons,
    });
  } else {
    await getTelegram().sendMessage({ text, buttons });
  }

  logger.info({ draftId: draft.id, topicId, lowSource, retries }, "WF-4: draft ready for approval");
  return draft;
}

/**
 * Generates an Instagram image via the configured provider and attaches it to
 * the draft. Best-effort: a failure here (no key, provider error) is logged
 * and left for the human to notice at approval time (WF-5 still refuses to
 * publish an Instagram draft with no media) rather than blocking the draft.
 */
async function attachGeneratedImage(
  draft: Draft,
  angle: string,
  pillarName: string,
  visualNotes: string | null,
): Promise<void> {
  try {
    const prompt = imagePrompt({ angle, pillar: pillarName, visualNotes });
    const image = await getImageGenerator().generate(prompt);
    const asset = await mediaAssets.create({
      draft_id: draft.id,
      type: "image",
      mime_type: image.mimeType,
      data: image.data,
      model_used: image.modelUsed,
    });
    await drafts.setMediaAsset(draft.id, asset.id);
    draft.media_asset_id = asset.id;
  } catch (err) {
    logger.warn({ err, draftId: draft.id }, "WF-4: image generation failed — draft has no media");
  }
}

/**
 * Regenerate the attached image for an Instagram draft (audit Phase 1 quick
 * win — previously a failed generation was a dead end short of rejecting the
 * whole draft, since the only recourse was passing mediaUrls manually).
 */
export async function regenerateDraftImage(draftId: number): Promise<Draft> {
  const draft = await drafts.get(draftId);
  if (!draft) throw new Error(`regenerateDraftImage: draft ${draftId} not found`);
  if (draft.platform !== "instagram") {
    throw new Error("regenerateDraftImage: only Instagram drafts carry a generated image");
  }
  const topic = await topics.get(draft.topic_id);
  if (!topic) throw new Error(`regenerateDraftImage: topic for draft ${draftId} not found`);
  const brand = await brands.get(topic.brand_id);
  const pillarName = await resolvePillarName(topic);
  const visualStyle = (topic.platform_extra as InstagramExtra | null)?.visualStyle;
  const visualNotes =
    [brand?.visual_notes, visualStyle ? `Visual style: ${visualStyle}.` : null]
      .filter(Boolean)
      .join(" ") || null;

  await attachGeneratedImage(draft, topic.angle ?? "", pillarName, visualNotes);
  if (draft.media_asset_id == null) {
    throw new Error("Image generation failed again — check the image provider's credentials.");
  }
  return draft;
}

async function resolvePillarName(topic: Topic): Promise<string> {
  if (topic.pillar_id == null) return "";
  const list = await pillars.listActive(topic.brand_id);
  return list.find((p) => p.id === topic.pillar_id)?.name ?? "";
}

const VALID_PLATFORMS = new Set<TargetPlatform>(["linkedin", "x", "instagram"]);
function normalizePlatform(p: string): TargetPlatform {
  return VALID_PLATFORMS.has(p as TargetPlatform) ? (p as TargetPlatform) : "linkedin";
}

/**
 * Turns structured per-platform guidance (§20) into a plain-language
 * instruction the existing draft prompt already knows how to use (mustSay).
 * Instagram's visual style is handled separately — see attachGeneratedImage.
 */
function extraGuidance(platform: TargetPlatform, extra: Topic["platform_extra"]): string | null {
  if (!extra) return null;
  if (platform === "linkedin") {
    const { audience, cta } = extra as LinkedInExtra;
    return (
      [
        audience ? `Write for this audience: ${audience}.` : "",
        cta ? `End with this call to action: ${cta}.` : "",
      ]
        .filter(Boolean)
        .join(" ") || null
    );
  }
  if (platform === "x") {
    const { angleStyle } = extra as XExtra;
    switch (angleStyle) {
      case "hot-take":
        return "Take a provocative, opinionated stance — don't hedge.";
      case "question":
        return "Frame it as a genuine question to the audience, not a statement.";
      case "informative":
        return "Keep it purely informative — no hot take, no question, just the insight.";
      default:
        return null;
    }
  }
  return null; // instagram's platform_extra is visual-only, applied to the image prompt
}

/**
 * Build grounding chunks. An explicitly chosen owned asset anchors the draft;
 * otherwise we semantic-search and honour the similarity threshold (§4.2).
 */
async function gatherChunks(
  topic: Topic,
): Promise<{ chunks: RetrievedChunk[]; lowSource: boolean }> {
  const query = [topic.angle, topic.why_now].filter(Boolean).join(". ");

  if (topic.source_asset_id != null) {
    const asset = await ownedAssets.get(topic.source_asset_id);
    if (asset) {
      await ownedAssets.markUsed(asset.id);
      const anchor: RetrievedChunk = { ...asset, similarity: 1 };
      // Supplement with related chunks for richer context (best-effort).
      const extra = await retrieve(topic.brand_id, query || asset.title || "").catch(() => null);
      const more = (extra?.chunks ?? []).filter((c) => c.id !== asset.id).slice(0, 3);
      return { chunks: [anchor, ...more], lowSource: false };
    }
  }

  const result = await retrieve(topic.brand_id, query || topic.angle || "");
  for (const c of result.chunks.slice(0, 1)) await ownedAssets.markUsed(c.id);
  return { chunks: result.chunks, lowSource: result.lowSource };
}
