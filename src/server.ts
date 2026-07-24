import express, { type Request, type Response } from "express";
import { z } from "zod";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { brands, approvals } from "./db/repositories/index.js";
import { getTelegram } from "./telegram/client.js";
import { parseCallback } from "./telegram/messages.js";
import { handleManualIntake } from "./workflows/wf3_manualIntake.js";
import { handlePitchCallback } from "./workflows/wf2_pitchCallback.js";
import { finalizeDraft } from "./workflows/wf5_approvalCallback.js";

/**
 * HTTP surface: the two webhooks that drive the pipeline plus health/metrics.
 *   POST /webhooks/manual-intake  — WF-3 (board/frontend row saved)
 *   POST /webhooks/telegram       — WF-2 + WF-5 (button callbacks / edit command)
 *   GET  /health                  — liveness
 *   GET  /metrics/quality         — §7 first-pass approval + edit distance
 */
export function createServer() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, db: config.db.enabled, llm: config.llm.live ? "live" : "mock" });
  });

  app.get("/metrics/quality", async (_req, res) => {
    if (!config.db.enabled) return res.status(503).json({ error: "DB not configured" });
    const stats = await approvals.qualityStats();
    res.json({ ...stats, target: config.quality.firstPassApprovalTarget });
  });

  // WF-3 · Manual Intake
  app.post("/webhooks/manual-intake", async (req: Request, res: Response) => {
    try {
      const { topicId, draft } = await handleManualIntake(req.body);
      res.json({ ok: true, topicId, draftId: draft.id });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
      logger.error({ err }, "manual-intake failed");
      res.status(500).json({ error: "internal error" });
    }
  });

  // WF-2 + WF-5 · Telegram callbacks & edit command
  app.post("/webhooks/telegram", async (req: Request, res: Response) => {
    // Ack immediately; Telegram retries on non-2xx.
    res.json({ ok: true });
    try {
      await handleTelegramUpdate(req.body);
    } catch (err) {
      logger.error({ err }, "telegram update handling failed");
    }
  });

  return app;
}

async function resolveBrandId(): Promise<number> {
  const brand = await brands.first();
  if (!brand) throw new Error("no brand configured — run `npm run seed`");
  return brand.id;
}

/** Route a Telegram Update to WF-2 (pitch) or WF-5 (approval), or the edit command. */
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
