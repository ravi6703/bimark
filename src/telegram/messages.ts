import type { InlineButton } from "./client.js";
import type { PitchPair } from "../agents/dailyPitch.js";
import type { Draft } from "../types.js";

/**
 * Callback_data encoding for inline buttons. Keep it compact — Telegram caps
 * callback_data at 64 bytes.  Format: "<action>:<id>".
 */
export const cb = {
  pickA: (topicId: number) => `pickA:${topicId}`,
  pickB: (topicId: number) => `pickB:${topicId}`,
  twoMore: (group: string) => `more:${group}`,
  skip: (group: string) => `skip:${group}`,
  approve: (draftId: number) => `approve:${draftId}`,
  edit: (draftId: number) => `edit:${draftId}`,
  reject: (draftId: number) => `reject:${draftId}`,
};

export interface ParsedCallback {
  action: "pickA" | "pickB" | "more" | "skip" | "approve" | "edit" | "reject";
  id: string; // topic id, draft id, or pitch group
}

export function parseCallback(data: string): ParsedCallback | null {
  const [action, id] = data.split(":");
  if (!action || id === undefined) return null;
  if (["pickA", "pickB", "more", "skip", "approve", "edit", "reject"].includes(action)) {
    return { action: action as ParsedCallback["action"], id };
  }
  return null;
}

/** §4.1 morning-message shape. */
export function morningPitchMessage(
  pitch: PitchPair,
  topicIdA: number,
  topicIdB: number,
  group: string,
): { text: string; buttons: InlineButton[][] } {
  const text =
    `☀️ <b>Two ideas for today</b>\n\n` +
    `<b>A)</b> ${pitch.A.angle}\n· pillar: ${pitch.A.pillar} · source: asset ${pitch.A.asset_id} · why now: ${pitch.A.why_now}\n\n` +
    `<b>B)</b> ${pitch.B.angle}\n· pillar: ${pitch.B.pillar} · source: asset ${pitch.B.asset_id} · why now: ${pitch.B.why_now}`;
  const buttons: InlineButton[][] = [
    [
      { text: "A", callback_data: cb.pickA(topicIdA) },
      { text: "B", callback_data: cb.pickB(topicIdB) },
    ],
    [
      { text: "🔄 Two more", callback_data: cb.twoMore(group) },
      { text: "⏭ Skip today", callback_data: cb.skip(group) },
    ],
  ];
  return { text, buttons };
}

/** Draft preview with the approve/edit/reject gate (§9). */
export function draftPreviewMessage(draft: Draft): {
  text: string;
  buttons: InlineButton[][];
} {
  const flagNote =
    draft.low_source === true
      ? "\n\n⚠️ <i>low source: no strong owned material matched — lighter on proof</i>"
      : "";
  const reviewerNote =
    draft.reviewer_result && draft.reviewer_result.verdict === "flag"
      ? `\n\n🚩 <i>reviewer flagged (escalated): ${draft.reviewer_result.notes}</i>`
      : "";
  const text =
    `📝 <b>Draft for ${draft.platform}</b>\n\n${draft.body ?? ""}` + flagNote + reviewerNote;
  const buttons: InlineButton[][] = [
    [
      { text: "✅ Approve", callback_data: cb.approve(draft.id) },
      { text: "✏️ Edit", callback_data: cb.edit(draft.id) },
      { text: "❌ Reject", callback_data: cb.reject(draft.id) },
    ],
  ];
  return { text, buttons };
}
