import { logger } from "../logger.js";
import { platformFor } from "../platforms/index.js";
import { approvals, brands, drafts, mediaAssets, posts, topics } from "../db/repositories/index.js";
import { buildMediaUrl } from "../images/index.js";
import { editDistance } from "../metrics/editDistance.js";
import { getPublisher } from "../publish/index.js";
import type { PublishCredentials } from "../publish/types.js";
import { getTelegram } from "../telegram/client.js";
import { buildUtmParams, stampBodyLinks } from "../publish/utm.js";
import type { Brand, Draft, DraftStatus, Platform, Post } from "../types.js";

/**
 * Per-brand publish credentials (multi-brand support follow-up) — each brand
 * can connect its own social accounts instead of posting through the shared
 * default (see db/migrations/010_brand_publish_credentials.sql). Falls back
 * to "no override" for any brand that hasn't had its own connected.
 */
function brandPublishCreds(brand: Brand | null): PublishCredentials {
  if (!brand) return {};
  return {
    apiKeyOverride: brand.ayrshare_api_key ?? undefined,
    profileKey: brand.ayrshare_profile_key ?? undefined,
  };
}

/**
 * Whether this channel has no "post to X" API to call — GEO has no platform to
 * post generative-answer content to, YouTube no video pipeline to produce an
 * upload from. Such drafts always end in the held state and use
 * markManuallyPosted() (the copy-out-and-record-it equivalent of a real
 * publish) instead of publishHeldDraft(). Which channels those are is the
 * registry's call (src/platforms), not a list maintained here.
 */
function isManualPublish(platform: string): boolean {
  return !platformFor(platform).autoPublish;
}

/** Velocity polling window (§7.1): metrics are polled for this long after publish. */
export const POLL_WINDOW_HOURS = 72;

export interface FinalizeInput {
  draftId: number;
  decision: "approve" | "reject";
  /** Operator's revised text (a reply-with-edit is an approve-with-edits). */
  editedText?: string;
  approver: string;
  reason?: string;
  scheduledAt?: Date | null;
  /** Required for Instagram — Ayrshare (and Instagram itself) rejects text-only posts. */
  mediaUrls?: string[];
  /**
   * Approve & hold (§20): lock in the content but don't publish yet. No
   * platform (LinkedIn/Instagram/X) exposes a "create a native draft" API —
   * this is the closest equivalent, and publishHeldDraft() below is the
   * later manual trigger that actually posts it.
   */
  hold?: boolean;
}

export interface FinalizeResult {
  action: "approve" | "edit" | "reject";
  editDistance: number;
  post?: Post;
  held?: boolean;
}

/**
 * WF-5 · Approval Callback Handler (§16, webhook). Terminal decision on a draft.
 * A reply carrying edited text is recorded as an `edit` (with edit_distance vs
 * the AI draft — the §7 metric); a bare ✅ is a clean `approve`; ❌ archives.
 * Approve either publishes immediately/on schedule, or — with `hold` — just
 * locks the content in and waits for publishHeldDraft(). One approval row per
 * draft keeps the §7 accounting honest.
 */
export async function finalizeDraft(input: FinalizeInput): Promise<FinalizeResult> {
  const draft = await drafts.get(input.draftId);
  if (!draft) throw new Error(`WF-5: draft ${input.draftId} not found`);
  const aiBody = draft.body ?? "";

  const edited =
    input.decision === "approve" &&
    input.editedText != null &&
    input.editedText.trim() !== "" &&
    input.editedText.trim() !== aiBody.trim();

  // GEO/YouTube (Okara-inspired follow-up) have no publish API to auto-post
  // to. They always end in the held state, regardless of what publish mode
  // was requested; markManuallyPosted() below is their equivalent of
  // publishHeldDraft() once the human has manually placed/uploaded it.
  const hold = input.hold || isManualPublish(draft.platform);

  // Concurrency guard (audit Phase 0): claim the draft atomically, computing
  // the final target status up front, before doing anything else. Two
  // simultaneous finalize calls on the same draft — Telegram racing the
  // dashboard, or two teammates both clicking Approve — can't both win: the
  // loser gets null back here instead of a second, duplicate publish.
  const targetStatus: DraftStatus =
    input.decision === "reject" ? "rejected" : hold ? "approved_hold" : edited ? "edited" : "approved";
  const claimed = await drafts.claim(draft.id, ["pending_approval"], targetStatus);
  if (!claimed) {
    throw new Error(
      `WF-5: draft ${input.draftId} was already finalized (current status: ${draft.status})`,
    );
  }

  if (input.decision === "reject") {
    await approvals.log({
      draft_id: draft.id,
      approver: input.approver,
      action: "reject",
      reason: input.reason ?? "",
    });
    await getTelegram().sendMessage({
      text: `❌ Rejected by ${input.approver}.${input.reason ? `\n${input.reason}` : ""}`,
    });
    logger.info({ draftId: draft.id, approver: input.approver }, "WF-5: rejected (feeds editorial memo)");
    return { action: "reject", editDistance: 0 };
  }

  // Approve (optionally with edits).
  const finalText = edited ? input.editedText!.trim() : aiBody;
  const distance = edited ? editDistance(aiBody, finalText) : 0;
  const action: "approve" | "edit" = edited ? "edit" : "approve";

  await approvals.log({
    draft_id: draft.id,
    approver: input.approver,
    action,
    edit_distance: distance,
  });
  if (edited) await drafts.setBody(draft.id, finalText, "edited");

  if (hold) {
    const approvedBy = `✅ ${action === "edit" ? "Approved with edits" : "Approved"} by ${input.approver}`;
    const note = platformFor(draft.platform).manualPublishNote;
    const holdMessage = note
      ? `${approvedBy} — ${note}`
      : `${approvedBy} — holding. Publish it from the dashboard whenever you're ready.`;
    await getTelegram().sendMessage({ text: holdMessage });
    logger.info(
      { draftId: draft.id, action, approver: input.approver, platform: draft.platform },
      "WF-5: approved & held (no auto-publish)",
    );
    return { action, editDistance: distance, held: true };
  }

  const post = await publishNow(draft, finalText, input.scheduledAt ?? null, input.mediaUrls);

  await getTelegram().sendMessage({
    text: `✅ ${action === "edit" ? "Approved with edits" : "Approved"} by ${input.approver} & ${post.scheduled_at ? "scheduled" : "published"}.${post.url ? `\n${post.url}` : ""}`,
  });

  logger.info(
    { draftId: draft.id, action, approver: input.approver, editDistance: distance, postId: post.id },
    "WF-5: finalized",
  );
  return { action, editDistance: distance, post };
}

/**
 * WF-5b · Manual publish trigger for a held draft (§20). The operator's own
 * click, whenever they're ready — no schedule, no auto-push.
 */
export async function publishHeldDraft(
  draftId: number,
  opts: { approver: string; scheduledAt?: Date | null; mediaUrls?: string[] },
): Promise<Post> {
  const draft = await drafts.get(draftId);
  if (!draft) throw new Error(`WF-5b: draft ${draftId} not found`);
  if (isManualPublish(draft.platform)) {
    throw new Error(
      `WF-5b: draft ${draftId} is ${draft.platform} content — there's no platform API to publish to; ` +
        "use markManuallyPosted() once it's been placed/uploaded manually.",
    );
  }

  // Concurrency guard: the same atomic claim as finalizeDraft, so two people
  // clicking "Publish now" on the same held draft can't both fire it.
  const claimed = await drafts.claim(draftId, ["approved_hold"], "approved");
  if (!claimed) {
    throw new Error(`WF-5b: draft ${draftId} is not held (current status: ${draft.status})`);
  }

  const post = await publishNow(draft, draft.body ?? "", opts.scheduledAt ?? null, opts.mediaUrls);
  await approvals.log({ draft_id: draftId, approver: opts.approver, action: "publish" });
  await getTelegram().sendMessage({
    text: `✅ Published by ${opts.approver} (was held).${post.url ? `\n${post.url}` : ""}`,
  });
  logger.info({ draftId, approver: opts.approver, postId: post.id }, "WF-5b: held draft published");
  return post;
}

/**
 * GEO/YouTube's equivalent of publishHeldDraft() (Okara-inspired follow-up).
 * There's no publish API for "your own website's CMS" or "upload this video,"
 * so this doesn't call getPublisher() at all — it just records that the
 * human placed/uploaded the content themselves, the same way an
 * Instagram/LinkedIn/X post gets a `posts` row, so it still shows up in the
 * calendar and posts-per-week rollup.
 */
export async function markManuallyPosted(draftId: number, approver: string): Promise<Post> {
  const draft = await drafts.get(draftId);
  if (!draft) throw new Error(`markManuallyPosted: draft ${draftId} not found`);
  if (!isManualPublish(draft.platform)) {
    throw new Error(`markManuallyPosted: draft ${draftId} isn't a manual-publish platform (platform: ${draft.platform})`);
  }
  const claimed = await drafts.claim(draftId, ["approved_hold"], "approved");
  if (!claimed) {
    throw new Error(`markManuallyPosted: draft ${draftId} is not held (current status: ${draft.status})`);
  }

  const post = await posts.create({
    draft_id: draftId,
    platform: draft.platform,
    external_id: null,
    url: null,
    scheduled_at: null,
    published_at: new Date(),
    poll_until: null, // no platform API to poll analytics from
  });
  await approvals.log({ draft_id: draftId, approver, action: "publish" });
  await getTelegram().sendMessage({ text: `✅ Marked posted by ${approver} (${draft.platform}, posted manually).` });
  logger.info({ draftId, approver, platform: draft.platform }, "WF-5c: draft marked posted manually");
  return post;
}

async function publishNow(
  draft: Draft,
  text: string,
  scheduledAt: Date | null,
  mediaUrlsOverride?: string[],
): Promise<Post> {
  // Instagram has no text-only post type — Ayrshare rejects it outright. WF-4
  // auto-generates + attaches an image for every Instagram draft (and, since
  // the LinkedIn multi-image follow-up, up to config.image.linkedinImageCount
  // for LinkedIn); fall back to an explicit override if the caller passed
  // one, and fail clearly if neither exists (image generation failed and
  // nothing was supplied manually).
  const generatedAssets = mediaUrlsOverride?.length ? [] : await mediaAssets.listForDraft(draft.id);
  const mediaUrls =
    mediaUrlsOverride?.length ? mediaUrlsOverride
    : generatedAssets.length ? generatedAssets.map((a) => buildMediaUrl(a.id))
    : undefined;
  const def = platformFor(draft.platform);
  if (def.requiresMedia && !mediaUrls?.length) {
    throw new Error(
      `${def.label} posts require an image — image generation failed for this draft; ` +
        "pass mediaUrls explicitly to publish it anyway.",
    );
  }

  const topic = await topics.get(draft.topic_id);
  const brand = topic ? await brands.get(topic.brand_id) : null;

  // Move 1 — stamp the brand's own links so this post's traffic is separable
  // from the rest of the site's. Only own-domain links are touched, and a post
  // with none is published verbatim and records no utm_campaign, so the
  // scoreboard never claims attribution that doesn't exist.
  const utm = buildUtmParams({
    platform: draft.platform,
    campaignId: topic?.campaign_id ?? null,
    topicId: draft.topic_id,
  });
  const { text: outgoing, stamped } = stampBodyLinks(text, brand?.site_url, utm);
  if (stamped > 0) {
    logger.info({ draftId: draft.id, stamped, campaign: utm.campaign }, "WF-5: stamped UTM on own-domain links");
  }

  const result = await getPublisher().publish({
    platform: draft.platform,
    text: outgoing,
    scheduledAt,
    mediaUrls,
    ...brandPublishCreds(brand),
  });

  const now = new Date();
  return posts.create({
    draft_id: draft.id,
    platform: draft.platform,
    external_id: result.externalId,
    url: result.url,
    scheduled_at: result.scheduledAt,
    published_at: result.publishedAt,
    poll_until: new Date(now.getTime() + POLL_WINDOW_HOURS * 3600 * 1000),
    utm_campaign: stamped > 0 ? utm.campaign : null,
  });
}
