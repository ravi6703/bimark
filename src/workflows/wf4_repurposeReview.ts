import { config } from "../config.js";
import { logger } from "../logger.js";
import { repurpose } from "../agents/repurpose.js";
import { review } from "../agents/reviewer.js";
import { DEFAULT_VOICE_GUIDE, imagePrompt, type TargetPlatform } from "../agents/prompts.js";
import { platformFor, visualNotesFor } from "../platforms/index.js";
import { brands, drafts, mediaAssets, ownedAssets, pillars, topics } from "../db/repositories/index.js";
import { buildMediaUrl, getImageGenerator } from "../images/index.js";
import { applyLogoWatermark } from "../images/watermark.js";
import { checkDistinctiveness } from "../rag/distinctiveness.js";
import { retrieve } from "../rag/retrieve.js";
import { getTelegram } from "../telegram/client.js";
import { draftPreviewMessage } from "../telegram/messages.js";
import type {
  Brand,
  Draft,
  GeoExtra,
  InstagramExtra,
  LinkedInExtra,
  ReviewerResult,
  RetrievedChunk,
  Topic,
  XExtra,
  YoutubeExtra,
} from "../types.js";

/**
 * WF-4 · Repurpose & Review → Draft (§16). Called by WF-2 (pitch pick) and WF-3
 * (manual intake). Same gate for both paths — no fast lane (§4.2).
 *
 *   retrieve owned material → draft → brand-safety review (loop on flag) →
 *   persist draft → Telegram approval preview.
 */
export class TopicAlreadyGeneratingError extends Error {
  constructor(topicId: number) {
    super(`Topic ${topicId} is already being generated`);
    this.name = "TopicAlreadyGeneratingError";
  }
}

export async function runRepurposeReview(topicId: number): Promise<Draft> {
  const existing = await topics.get(topicId);
  if (!existing) throw new Error(`WF-4: topic ${topicId} not found`);

  // Claim it before doing any expensive work — see topics.claimForDrafting.
  const topic = await topics.claimForDrafting(topicId);
  if (!topic) throw new TopicAlreadyGeneratingError(topicId);

  try {
    return await generateForClaimedTopic(topic);
  } catch (err) {
    // Hand the topic back to the queue so the drain cron (or a retry from the
    // dashboard) can pick it up again — otherwise a mid-generation failure
    // strands it in `drafting` forever with no draft to show for it.
    await topics.setStatus(topicId, "picked").catch((resetErr) => {
      logger.error({ err: resetErr, topicId }, "WF-4: failed to release topic back to the queue");
    });
    throw err;
  }
}

async function generateForClaimedTopic(topic: Topic): Promise<Draft> {
  const topicId = topic.id;
  const brand = await brands.get(topic.brand_id);
  const voiceGuide = brand?.voice_guide ?? DEFAULT_VOICE_GUIDE;
  const bannedTopics = brand?.banned_topics ?? [];
  const pillarName = await resolvePillarName(topic);
  const platform = normalizePlatform(topic.platform);
  const def = platformFor(platform);

  // Step 1 — gather grounding chunks (§16 WF-4.1).
  const { chunks, lowSource } = await gatherChunks(topic);

  // Step 1b — fold structured per-platform guidance (§20) into the free-text
  // must-say the draft prompt already understands, rather than growing the
  // prompt builder's parameter list per platform.
  const mustSay = [topic.must_say, def.guidance(topic.platform_extra)]
    .filter(Boolean)
    .join(" ") || undefined;

  // Step 1c — recent angles already covered for this pillar+platform (§20
  // follow-up, "show previous data") — steers generation away from repeating
  // itself, proactively rather than only catching it after the fact (5a).
  const recentAngles = (
    await drafts.listRecentAngles(topic.brand_id, platform, topic.pillar_id, 5)
  )
    .map((r) => r.angle)
    .filter((a) => a && a !== topic.angle);

  // Step 2 — repurpose into a draft.
  let draftOut = await repurpose({
    voiceGuide,
    angle: topic.angle ?? "",
    pillar: pillarName,
    chunks,
    mustSay,
    format: topic.format_hint,
    platform,
    recentAngles,
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
      recentAngles,
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

  // Step 5a — distinctiveness guard (audit Phase 3): does this repeat a
  // recently approved/published post on the same platform? Best-effort —
  // an embedding failure shouldn't block the draft, same posture as the
  // image-generation step below.
  try {
    const distinctiveness = await checkDistinctiveness(topic.brand_id, platform, draftOut.body, draft.id);
    if (distinctiveness.embedding.length > 0) {
      await drafts.setDistinctiveness(draft.id, distinctiveness);
      draft.repetitive = distinctiveness.repetitive;
      draft.similar_to_draft_id = distinctiveness.similarToDraftId;
      if (distinctiveness.repetitive) {
        logger.info(
          { draftId: draft.id, similarToDraftId: distinctiveness.similarToDraftId, similarity: distinctiveness.similarity },
          "WF-4: draft looks like a recent repeat",
        );
      }
    }
  } catch (err) {
    logger.warn({ err, draftId: draft.id }, "WF-4: distinctiveness check failed — proceeding without it");
  }

  // Step 5b — how many images this channel carries, and any channel-specific
  // visual guidance, are the registry's business (src/platforms).
  const imageCount = def.imageCount();
  if (imageCount > 0) {
    await attachGeneratedImages(
      draft,
      imageCount,
      topic.angle ?? "",
      pillarName,
      visualNotesFor(platform, brand?.visual_notes, topic.platform_extra),
      def.imageAspect,
      brand,
    );
  }

  // Step 6 — Telegram approval preview (§9 gate). Send the generated image
  // as a photo (caption = preview text) when one is attached, so the editor
  // can see what will actually post before approving.
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
 * Generates `count` images via the configured provider, watermarks each with
 * the brand's real logo when one has been uploaded (brands.logo_data — never
 * a placeholder mark otherwise), and attaches all of them to the draft.
 * draft.media_asset_id keeps pointing at the first one generated (the
 * "cover" image, for back-compat with anything that only knows about one);
 * the full ordered set lives in the assets table (mediaAssets.listForDraft).
 * Best-effort: a failure here is logged and left for the human to notice at
 * approval time (WF-5 still refuses to publish an image-required draft with
 * no media) rather than blocking the draft.
 */
async function attachGeneratedImages(
  draft: Draft,
  count: number,
  angle: string,
  pillarName: string,
  visualNotes: string | null,
  aspect: "square" | "landscape",
  brand: Brand | null,
): Promise<void> {
  const logo = brand?.logo_data ? { mimeType: brand.logo_mime_type ?? "image/png", data: brand.logo_data } : null;
  let firstAssetId: number | null = null;
  for (let i = 0; i < count; i++) {
    try {
      const variationHint =
        count > 1 ? `Image ${i + 1} of ${count}: a different visual angle/composition than the others, same topic and style.` : null;
      const prompt = imagePrompt({ angle, pillar: pillarName, visualNotes, aspect, variationHint });
      let image = await getImageGenerator().generate(prompt);
      if (logo) {
        image = await applyLogoWatermark(image, logo);
      }
      const asset = await mediaAssets.create({
        draft_id: draft.id,
        type: "image",
        mime_type: image.mimeType,
        data: image.data,
        model_used: image.modelUsed,
      });
      firstAssetId ??= asset.id;
    } catch (err) {
      logger.warn({ err, draftId: draft.id, image: i + 1, count }, "WF-4: image generation failed for this slot");
    }
  }
  if (firstAssetId != null) {
    await drafts.setMediaAsset(draft.id, firstAssetId);
    draft.media_asset_id = firstAssetId;
  }
}

/**
 * Regenerate the attached image(s) for a draft (audit Phase 1 quick win,
 * extended for LinkedIn multi-image) — previously a failed generation was a
 * dead end short of rejecting the whole draft, since the only recourse was
 * passing mediaUrls manually. Clears the draft's existing images first so a
 * regenerate replaces the whole set rather than piling a second gallery on
 * top of the first. Which channels carry images, how many, and what shape is
 * the registry's call (src/platforms).
 */
export async function regenerateDraftImage(draftId: number): Promise<Draft> {
  const draft = await drafts.get(draftId);
  if (!draft) throw new Error(`regenerateDraftImage: draft ${draftId} not found`);
  const def = platformFor(draft.platform);
  if (def.imageCount() < 1) {
    throw new Error(`regenerateDraftImage: ${def.label} drafts don't carry generated images`);
  }
  const topic = await topics.get(draft.topic_id);
  if (!topic) throw new Error(`regenerateDraftImage: topic for draft ${draftId} not found`);
  const brand = await brands.get(topic.brand_id);
  const pillarName = await resolvePillarName(topic);

  await mediaAssets.deleteForDraft(draftId);
  draft.media_asset_id = null;

  await attachGeneratedImages(
    draft,
    def.imageCount(),
    topic.angle ?? "",
    pillarName,
    visualNotesFor(draft.platform, brand?.visual_notes, topic.platform_extra),
    def.imageAspect,
    brand,
  );

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

function normalizePlatform(p: string): TargetPlatform {
  return platformFor(p).key;
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
