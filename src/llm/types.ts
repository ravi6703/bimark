/** Task categories that drive model routing (§20). */
export type LlmTask =
  | "pitch" // daily pitch / ideation — fast, cheap tier
  | "clarify" // pre-draft clarity check (§20) — fast tier
  | "draft" // first draft — fast tier
  | "polish" // final copy polish — strong tier
  | "review" // brand-safety reviewer — strong tier (safety is won here)
  | "memo" // monthly editorial memo — strong tier
  | "onboarding"; // AI-derived brand profile proposal — strong tier (sets the whole voice)

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmCompleteOptions {
  task: LlmTask;
  system?: string;
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Ask the provider to return strict JSON; providers append a nudge + parse-guard. */
  json?: boolean;
  /**
   * Deterministic output the MockLLM returns verbatim (real providers ignore it).
   * Agents compute a referentially-valid fallback so the whole pipeline runs
   * offline with no API key — e.g. a pitch that cites real owned-asset ids.
   */
  mockResult?: string;
}

export interface LlmResult {
  text: string;
  modelUsed: string;
  /** Best-effort token accounting for cost tagging (§20). */
  inputTokens?: number;
  outputTokens?: number;
}

export interface LlmProvider {
  readonly name: string;
  complete(opts: LlmCompleteOptions): Promise<LlmResult>;
}
