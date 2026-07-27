import { getLlm, parseJson } from "../llm/index.js";
import type { LlmProvider } from "../llm/types.js";
import type { PillarIntent, RetrievedChunk } from "../types.js";
import { capForPlatform, platformFor } from "../platforms/index.js";
import { PROMPT_VERSION, repurposePrompt, type TargetPlatform } from "./prompts.js";

export interface RepurposeOutput {
  body: string;
  variants: string[];
  claims_used: string[];
  promptVersion: string;
  modelUsed: string;
}

function chunksToContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "(no strong source asset found)";
  return chunks
    .map((c, i) => `[S${i + 1} · ${c.title ?? "untitled"}] ${(c.chunk_text ?? "").trim()}`)
    .join("\n\n");
}

/**
 * Repurposing agent (§4 / §17.3). Turns retrieved owned material into a
 * pillar-mapped LinkedIn draft that uses ONLY facts present in the source.
 */
export async function repurpose(
  input: {
    voiceGuide: string;
    angle: string;
    pillar: string;
    chunks: RetrievedChunk[];
    mustSay?: string | null;
    format?: string | null;
    platform?: TargetPlatform;
    recentAngles?: string[];
    /** What the pillar is for (Move 4) — decides whether this post offers a
     * next step at all. Defaults to 'authority', i.e. it doesn't. */
    pillarIntent?: PillarIntent;
    conversionTarget?: string | null;
  },
  llm: LlmProvider = getLlm(),
): Promise<RepurposeOutput> {
  const platform = input.platform ?? "linkedin";
  const context = chunksToContext(input.chunks);
  const { system, user } = repurposePrompt({
    voiceGuide: input.voiceGuide,
    angle: input.angle,
    pillar: input.pillar,
    retrievedChunks: context,
    mustSay: input.mustSay ?? null,
    format: input.format ?? null,
    platform,
    recentAngles: input.recentAngles,
    pillarIntent: input.pillarIntent,
    conversionTarget: input.conversionTarget,
  });

  const res = await llm.complete({
    task: "draft",
    system,
    messages: [{ role: "user", content: user }],
    json: true,
    maxTokens: 900,
    mockResult: JSON.stringify(mockDraft(input.angle, input.chunks, platform)),
  });

  const parsed = parseJson<{ body: string; variants?: string[]; claims_used?: string[] }>(
    res.text,
    "repurpose",
  );
  return {
    // Enforced in code as well as in the prompt — see capForPlatform.
    body: capForPlatform(platform, parsed.body),
    variants: parsed.variants ?? [],
    claims_used: parsed.claims_used ?? [],
    promptVersion: PROMPT_VERSION,
    modelUsed: res.modelUsed,
  };
}

/** Deterministic offline draft grounded in the retrieved snippets. */
function mockDraft(
  angle: string,
  chunks: RetrievedChunk[],
  platform: TargetPlatform,
): {
  body: string;
  variants: string[];
  claims_used: string[];
} {
  const lead = chunks[0]?.chunk_text?.replace(/\s+/g, " ").slice(0, 180) ?? "";
  const body = platformFor(platform).maxChars
    ? capForPlatform(platform, `${angle}. ${lead}`)
    : `${angle}.\n\n${lead}\n\n` +
      "The takeaway for anyone building employability at scale: ground the work in " +
      "real outcomes, not slogans. That is how trust compounds.";
  return {
    body,
    variants: [`A sharper hook on: ${angle}`, `A data-led hook on: ${angle}`],
    claims_used: chunks.slice(0, 2).map((c) => `Source: ${c.title ?? "owned asset"}`),
  };
}
