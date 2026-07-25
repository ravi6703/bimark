import { getLlm, parseJson } from "../llm/index.js";
import { clarifyPrompt } from "./prompts.js";

export interface ClarifyQuestion {
  platform: string;
  question: string;
}

export interface ClarifyResult {
  sufficient: boolean;
  questions: ClarifyQuestion[];
}

/**
 * §20 — runs before repurpose() so a vague topic gets a couple of sharp
 * questions instead of silently producing a generic draft. Deterministic
 * mock always says "sufficient" — offline/CI runs are never blocked.
 */
export async function clarifyTopic(
  input: { topic: string; platforms: string[]; mustSay?: string; whyNow?: string },
  llm = getLlm(),
): Promise<ClarifyResult> {
  const { system, user } = clarifyPrompt(input);
  const res = await llm.complete({
    task: "clarify",
    system,
    messages: [{ role: "user", content: user }],
    json: true,
    maxTokens: 300,
    mockResult: JSON.stringify({ sufficient: true, questions: [] }),
  });
  const parsed = parseJson<{ sufficient?: boolean; questions?: ClarifyQuestion[] }>(
    res.text,
    "clarify",
  );
  return {
    sufficient: parsed.sufficient !== false,
    questions: Array.isArray(parsed.questions) ? parsed.questions.slice(0, 2) : [],
  };
}
