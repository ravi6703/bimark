import { getLlm, parseJson } from "../llm/index.js";
import type { LlmProvider } from "../llm/types.js";
import type { OwnedAsset, Pillar } from "../types.js";
import { PROMPT_VERSION, dailyPitchPrompt } from "./prompts.js";

export interface PitchOption {
  angle: string;
  pillar: string;
  asset_id: number;
  why_now: string;
}
export interface PitchPair {
  A: PitchOption;
  B: PitchOption;
  promptVersion: string;
}

function assetLine(a: OwnedAsset, pillarName: string): string {
  const snippet = (a.chunk_text ?? "").replace(/\s+/g, " ").slice(0, 160);
  return `id:${a.id} | pillar:${pillarName} | ${a.title ?? "untitled"} — ${snippet}`;
}

/**
 * Daily Pitch agent (§4.1 / §17.2). Produces exactly two owned-material-grounded
 * ideas across (preferably) different pillars. The mock fallback picks two real
 * candidate asset ids so the offline pipeline stays referentially valid.
 */
export async function generatePitch(
  input: { pillars: Pillar[]; candidates: OwnedAsset[]; trendSignal?: string },
  llm: LlmProvider = getLlm(),
): Promise<PitchPair> {
  const pillarById = new Map(input.pillars.map((p) => [p.id, p.name] as const));
  const pillarName = (id: number | null) => (id != null ? (pillarById.get(id) ?? "") : "");

  const pillarsStr = input.pillars.map((p) => `${p.name}: ${p.description ?? ""}`).join(" | ");
  const assetsStr = input.candidates.map((a) => assetLine(a, pillarName(a.pillar_hint))).join("\n");

  const { system, user } = dailyPitchPrompt({
    pillars: pillarsStr,
    retrievedAssets: assetsStr,
    trendSignal: input.trendSignal ?? "",
  });

  const res = await llm.complete({
    task: "pitch",
    system,
    messages: [{ role: "user", content: user }],
    json: true,
    maxTokens: 512,
    mockResult: JSON.stringify(mockPitch(input.candidates, pillarName)),
  });

  const parsed = parseJson<{ A: PitchOption; B: PitchOption }>(res.text, "daily pitch");
  return { A: parsed.A, B: parsed.B, promptVersion: PROMPT_VERSION };
}

/** Deterministic offline pitch: two candidates, different pillars where possible. */
function mockPitch(
  candidates: OwnedAsset[],
  pillarName: (id: number | null) => string,
): { A: PitchOption; B: PitchOption } {
  const a = candidates[0];
  const b =
    candidates.find((c) => c.pillar_hint !== a?.pillar_hint) ?? candidates[1] ?? candidates[0];
  const opt = (asset: OwnedAsset | undefined, label: string): PitchOption => ({
    angle: `What ${asset?.title ?? "our latest work"} says about ${label.toLowerCase()}`,
    pillar: pillarName(asset?.pillar_hint ?? null),
    asset_id: asset?.id ?? 0,
    why_now: "Grounded in owned material available to repurpose now",
  });
  return { A: opt(a, "the skills gap"), B: opt(b, "industry-academia collaboration") };
}
