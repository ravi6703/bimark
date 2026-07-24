import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { modelForTask } from "./router.js";
import type { LlmCompleteOptions, LlmProvider, LlmResult } from "./types.js";

/** Anthropic-backed provider. Used only when ANTHROPIC_API_KEY is set. */
export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: config.llm.apiKey });
  }

  async complete(opts: LlmCompleteOptions): Promise<LlmResult> {
    const model = modelForTask(opts.task);
    const system =
      opts.json && opts.system
        ? `${opts.system}\n\nReturn ONLY valid JSON. No preamble, no markdown fences.`
        : opts.system;

    const res = await this.client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? (opts.task === "review" ? 0 : 0.7),
      ...(system ? { system } : {}),
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const text = res.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");

    return {
      text: opts.json ? stripFences(text) : text,
      modelUsed: model,
      inputTokens: res.usage?.input_tokens,
      outputTokens: res.usage?.output_tokens,
    };
  }
}

/** Tolerate a model that wraps JSON in ```json fences despite instructions. */
export function stripFences(s: string): string {
  const trimmed = s.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fence ? fence[1]!.trim() : trimmed;
}
