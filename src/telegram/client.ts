import { config } from "../config.js";
import { logger } from "../logger.js";

/** One inline-keyboard button. `callback_data` carries routing + ids (WF-2/WF-5). */
export interface InlineButton {
  text: string;
  callback_data: string;
}

export interface SendMessageOptions {
  chatId?: string;
  text: string;
  buttons?: InlineButton[][]; // rows of buttons
}

/**
 * Minimal Telegram Bot API client. When no token is configured it logs the
 * message instead of sending — so the approval gate is visible in dev without a
 * bot, and tests never touch the network.
 */
export class TelegramClient {
  private base: string | null;

  constructor(private token = config.telegram.token) {
    this.base = token ? `https://api.telegram.org/bot${token}` : null;
  }

  get live(): boolean {
    return this.base !== null;
  }

  async sendMessage(opts: SendMessageOptions): Promise<{ messageId: number | null }> {
    const chatId = opts.chatId ?? config.telegram.chatId;
    const reply_markup = opts.buttons ? { inline_keyboard: opts.buttons } : undefined;

    if (!this.base) {
      logger.info(
        { chatId, text: opts.text, buttons: opts.buttons },
        "[telegram:dry-run] would send message",
      );
      return { messageId: null };
    }

    const res = await this.call("sendMessage", {
      chat_id: chatId,
      text: opts.text,
      parse_mode: "HTML",
      ...(reply_markup ? { reply_markup } : {}),
    });
    return { messageId: (res as { result?: { message_id?: number } })?.result?.message_id ?? null };
  }

  async editMessageText(chatId: string, messageId: number, text: string): Promise<void> {
    if (!this.base) {
      logger.info({ chatId, messageId, text }, "[telegram:dry-run] would edit message");
      return;
    }
    await this.call("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    if (!this.base) return;
    await this.call("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
    });
  }

  private async call(method: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${this.base}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      logger.error({ method, status: res.status, errText }, "telegram API error");
      throw new Error(`telegram ${method} failed: ${res.status}`);
    }
    return res.json();
  }
}

let client: TelegramClient | null = null;
export function getTelegram(): TelegramClient {
  if (!client) client = new TelegramClient();
  return client;
}
export function setTelegram(c: TelegramClient): void {
  client = c;
}
