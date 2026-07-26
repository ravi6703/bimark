import { config } from "../config.js";
import type { LlmTask } from "./types.js";

/**
 * Model routing (§20): route by task, not one model for everything — the main
 * cost lever. Low-stakes, high-volume generation goes to the fast tier; quality
 * and safety (final polish + the brand-safety reviewer) go to the strong tier.
 */
const STRONG_TASKS: ReadonlySet<LlmTask> = new Set(["polish", "review", "memo", "onboarding"]);

export function modelForTask(task: LlmTask): string {
  return STRONG_TASKS.has(task) ? config.llm.modelStrong : config.llm.modelFast;
}

export function tierForTask(task: LlmTask): "fast" | "strong" {
  return STRONG_TASKS.has(task) ? "strong" : "fast";
}
