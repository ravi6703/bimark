import { logger } from "../logger.js";
import { approvals, drafts, posts } from "../db/repositories/index.js";
import { editDistance } from "../metrics/editDistance.js";
import { getPublisher } from "../publish/index.js";
import { getTelegram } from "../telegram/client.js";
import type { Post } from "../types.js";

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
}

export interface FinalizeResult {
  action: "approve" | "edit" | "reject";
  editDistance: number;
  post?: Post;
}

/**
 * WF-5 · Approval Callback Handler (§16, webhook). Terminal decision on a draft.
 * A reply carrying edited text is recorded as an `edit` (with edit_distance vs
 * the AI draft — the §7 metric) and published; a bare ✅ is a clean `approve`;
 * ❌ archives. One approval row per draft keeps the §7 accounting honest.
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
    logger.info({ draftId: draft.id }, "WF-5: rejected (feeds editorial memo)");
    return { action: "reject", editDistance: 0 };
  }

  // Instagram has no text-only post type — Ayrshare rejects it outright.
  // Fail clearly here rather than let the publish call error opaquely.
  if (draft.platform === "instagram" && !input.mediaUrls?.length) {
    throw new Error(
      "Instagram posts require at least one image — pass mediaUrls when approving this draft.",
    );
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
  else await drafts.setStatus(draft.id, "approved");

  // Publish via the bought plumbing (§8).
  const result = await getPublisher().publish({
    platform: draft.platform,
    text: finalText,
    scheduledAt: input.scheduledAt ?? null,
    mediaUrls: input.mediaUrls,
  });

  const now = new Date();
  const post = await posts.create({
    draft_id: draft.id,
    platform: draft.platform,
    external_id: result.externalId,
    url: result.url,
    scheduled_at: result.scheduledAt,
    published_at: result.publishedAt,
    poll_until: new Date(now.getTime() + POLL_WINDOW_HOURS * 3600 * 1000),
  });

  await getTelegram().sendMessage({
    text: `✅ ${action === "edit" ? "Approved with edits" : "Approved"} & ${result.scheduledAt ? "scheduled" : "published"}.${result.url ? `\n${result.url}` : ""}`,
  });

  logger.info(
    { draftId: draft.id, action, editDistance: distance, postId: post.id },
    "WF-5: finalized",
  );
  return { action, editDistance: distance, post };
}
