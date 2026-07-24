import { config } from "../config.js";
import { logger } from "../logger.js";
import { AnthropicProvider } from "./anthropic.js";
import { MockLLM } from "./mock.js";
import type { LlmProvider } from "./types.js";

export * from "./types.js";
export { modelForTask, tierForTask } from "./router.js";

let provider: LlmProvider | null = null;

/** Returns the live Anthropic provider if a key is set, else the offline mock. */
export function getLlm(): LlmProvider {
  if (!provider) {
    if (config.llm.live) {
      provider = new AnthropicProvider();
      logger.info({ provider: "anthropic" }, "LLM provider ready");
    } else {
      provider = new MockLLM();
      logger.warn("ANTHROPIC_API_KEY not set — using deterministic MockLLM");
    }
  }
  return provider;
}

/** For tests: inject a provider (e.g. a scripted fake). */
export function setLlm(p: LlmProvider): void {
  provider = p;
}

/**
 * Parse a JSON completion defensively. Throws a descriptive error including a
 * snippet so prompt-tuning failures are diagnosable.
 */
export function parseJson<T>(text: string, context: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    // Salvage the first {...} or [...] block if the model added prose.
    const match = text.match(/[{[][\s\S]*[}\]]/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        /* fall through */
      }
    }
    throw new Error(`${context}: LLM did not return valid JSON. Got: ${text.slice(0, 200)}`);
  }
}
