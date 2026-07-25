import type { VercelRequest, VercelResponse } from "@vercel/node";
import { logger } from "../../src/logger.js";
import { handleTelegramUpdate } from "../../src/telegram/handleUpdate.js";

/**
 * WF-2 + WF-5 · Telegram callbacks & edit command. Set this URL as the bot's
 * webhook (`setWebhook`). Acks immediately — Telegram retries on non-2xx —
 * then processes the update; errors are logged, not surfaced to Telegram.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  res.status(200).json({ ok: true });
  try {
    await handleTelegramUpdate(req.body);
  } catch (err) {
    logger.error({ err }, "telegram update handling failed");
  }
}
