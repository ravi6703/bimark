import { brands } from "../db/repositories/index.js";
import { handlePitchCallback } from "../workflows/wf2_pitchCallback.js";
import { finalizeDraft } from "../workflows/wf5_approvalCallback.js";
import { getTelegram } from "./client.js";
import { parseCallback } from "./messages.js";

/**
 * Route a Telegram Update to WF-2 (pitch) or WF-5 (approval), or the edit
 * command. Framework-agnostic — used by both the Express server (Docker/VM)
 * and the Vercel serverless webhook, so neither has to depend on the other.
 */
export async function handleTelegramUpdate(update: any): Promise<void> {
  const tg = getTelegram();

  // Button callbacks (pick/more/skip/approve/reject).
  if (update.callback_query) {
    const q = update.callback_query;
    const parsed = parseCallback(q.data ?? "");
    if (!parsed) return;
    const approver = q.from?.username ?? String(q.from?.id ?? "unknown");
    const brandId = await resolveBrandId();

    if (["pickA", "pickB", "more", "skip"].includes(parsed.action)) {
      await handlePitchCallback(parsed, brandId);
    } else if (parsed.action === "approve") {
      await finalizeDraft({ draftId: Number(parsed.id), decision: "approve", approver });
    } else if (parsed.action === "reject") {
      await finalizeDraft({ draftId: Number(parsed.id), decision: "reject", approver });
    } else if (parsed.action === "edit") {
      await tg.sendMessage({
        text: `✏️ Reply with your edited version as:\n<code>/edit ${parsed.id} your text…</code>`,
      });
    }
    if (q.id) await tg.answerCallbackQuery(q.id, "Got it");
    return;
  }

  // Edit command: "/edit <draftId> <text>" (stateless approve-with-edits).
  if (update.message?.text) {
    const m = update.message.text.match(/^\/edit\s+(\d+)\s+([\s\S]+)$/);
    if (m) {
      const approver = update.message.from?.username ?? String(update.message.from?.id ?? "unknown");
      await finalizeDraft({
        draftId: Number(m[1]),
        decision: "approve",
        editedText: m[2],
        approver,
      });
    }
  }
}

async function resolveBrandId(): Promise<number> {
  const brand = await brands.first();
  if (!brand) throw new Error("no brand configured — run `npm run seed`");
  return brand.id;
}
