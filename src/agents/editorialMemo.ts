import { getLlm } from "../llm/index.js";
import type { LlmProvider } from "../llm/types.js";
import { editorialMemoPrompt } from "./prompts.js";

/**
 * Editorial Memo agent (§16 WF-7). Monthly, human-read: what landed, what got
 * skipped, what to make more of. Not an ML loop — a plain-language memo.
 */
export async function generateMemo(
  input: { period: string; landed: string; skipped: string; sov: string },
  llm: LlmProvider = getLlm(),
): Promise<string> {
  const { system, user } = editorialMemoPrompt(input);
  const res = await llm.complete({
    task: "memo",
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 700,
    mockResult:
      `Editorial memo — ${input.period} (mock)\n\n` +
      `What landed: ${input.landed || "n/a"}.\n` +
      `What got skipped: ${input.skipped || "n/a"}.\n` +
      `SOV trend: ${input.sov || "n/a"}.\n\n` +
      "Recommendation: keep repurposing owned material on the pillars that drew " +
      "substantive comments; retire angles that were repeatedly skipped.",
  });
  return res.text;
}
