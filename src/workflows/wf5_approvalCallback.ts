import { logger } from "../logger.js";
import { approvals, drafts, posts } from "../db/repositories/index.js";
import { buildMediaUrl } from "../images/index.js";
import { editDistance } from "../metrics/editDistance.js";
import { getPublisher } from "../publish/index.js";
import { getTelegram } from "../telegram/client.js";
import type { Draft, Post } from "../types.js";

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

  if (input.decision === "reject") {
    await approvals.log({
      draft_id: draft.id,
      approver: input.approver,
      action: "reject",
      reason: input.reason ?? "",
    });
    await drafts.setStatus(draft.id, "rejected");
    await getTelegram().sendMessage({
      text: `❌ Rejected.${input.reason ? `\n${input.reason}` : ""}`,
    });
    logger.info({ draftId: draft.id }, "WF-5: rejected (feeds editorial memo)");
    return { action: "reject", editDistance: 0 };
  }

  // Approve (optionally with edits).
  const edited = input.editedText != null && input.editedText.trim() !== "" &&
    input.editedText.trim() !== aiBody.trim();
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

  if (input.hold) {
    await drafts.setStatus(draft.id, "approved_hold");
    await getTelegram().sendMessage({
      text: `✅ ${action === "edit" ? "Approved with edits" : "Approved"} — holding. Publish it from the dashboard whenever you're ready.`,
    });
    logger.info({ draftId: draft.id, action }, "WF-5: approved & held (no auto-publish)");
    return { action, editDistance: distance, held: true };
  }
  if (!edited) await drafts.setStatus(draft.id, "approved");

  const post = await publishNow(draft, finalText, input.scheduledAt ?? null, input.mediaUrls);

  await getTelegram().sendMessage({
    text: `✅ ${action === "edit" ? "Approved with edits" : "Approved"} & ${post.scheduled_at ? "scheduled" : "published"}.${post.url ? `\n${post.url}` : ""}`,
  });

  logger.info(
    { draftId: draft.id, action, editDistance: distance, postId: post.id },
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
  opts: { scheduledAt?: Date | null; mediaUrls?: string[] } = {},
): Promise<Post> {
  const draft = await drafts.get(draftId);
  if (!draft) throw new Error(`WF-5b: draft ${draftId} not found`);
  if (draft.status !== "approved_hold") {
    throw new Error(`WF-5b: draft ${draftId} is not held (status: ${draft.status})`);
  }
  const post = await publishNow(draft, draft.body ?? "", opts.scheduledAt ?? null, opts.mediaUrls);
  await drafts.setStatus(draftId, "approved");
  await getTelegram().sendMessage({
    text: `✅ Published (was held).${post.url ? `\n${post.url}` : ""}`,
  });
  logger.info({ draftId, postId: post.id }, "WF-5b: held draft published");
  return post;
}

async function publishNow(
  draft: Draft,
  text: string,
  scheduledAt: Date | null,
  mediaUrlsOverride?: string[],
): Promise<Post> {
  // Instagram has no text-only post type — Ayrshare rejects it outright. WF-4
  // auto-generates + attaches an image for every Instagram draft; fall back to
  // an explicit override if the caller passed one, and fail clearly if neither
  // exists (image generation failed and nothing was supplied manually).
  const mediaUrls =
    mediaUrlsOverride?.length ? mediaUrlsOverride
    : draft.media_asset_id != null ? [buildMediaUrl(draft.media_asset_id)]
    : undefined;
  if (draft.platform === "instagram" && !mediaUrls?.length) {
    throw new Error(
      "Instagram posts require an image — image generation failed for this draft; " +
        "pass mediaUrls explicitly to publish it anyway.",
    );
  }

  const result = await getPublisher().publish({
    platform: draft.platform,
    text,
    scheduledAt,
    mediaUrls,
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
  });
}
