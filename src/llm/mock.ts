import { modelForTask } from "./router.js";
import type { LlmCompleteOptions, LlmProvider, LlmResult } from "./types.js";

/**
 * Deterministic, offline LLM used when ANTHROPIC_API_KEY is absent. It lets the
 * entire pipeline (and the test suite) run without network or spend. When a
 * caller supplies `mockResult` it is returned verbatim; otherwise a plausible
 * stub is synthesised from the prompt so structure-level assertions still hold.
 */
export class MockLLM implements LlmProvider {
  readonly name = "mock";

  async complete(opts: LlmCompleteOptions): Promise<LlmResult> {
    const model = `mock:${modelForTask(opts.task)}`;
    if (opts.mockResult !== undefined) {
      return { text: opts.mockResult, modelUsed: model, inputTokens: 0, outputTokens: 0 };
    }

    const lastUser = [...opts.messages].reverse().find((m) => m.role === "user");
    const text = opts.json
      ? this.jsonStub(opts)
      : `MOCK(${opts.task}): ${(lastUser?.content ?? "").slice(0, 140)}`;

    return { text, modelUsed: model, inputTokens: 0, outputTokens: 0 };
  }

  private jsonStub(opts: LlmCompleteOptions): string {
    switch (opts.task) {
      case "review":
        return JSON.stringify({ verdict: "pass", flags: [], notes: "mock: no issues found" });
      case "pitch":
        return JSON.stringify({
          A: { angle: "Mock angle A", pillar: "", asset_id: 0, why_now: "mock" },
          B: { angle: "Mock angle B", pillar: "", asset_id: 0, why_now: "mock" },
        });
      case "draft":
      case "polish":
        return JSON.stringify({
          body: "Mock LinkedIn draft grounded in the provided source material.",
          variants: ["Mock alt hook 1", "Mock alt hook 2"],
          claims_used: [],
        });
      default:
        return JSON.stringify({ result: "mock" });
    }
  }
}
