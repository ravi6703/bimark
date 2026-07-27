import { describe, expect, it } from "vitest";
import { MockLLM } from "../src/llm/mock.js";
import { parseJson } from "../src/llm/index.js";
import { generatePitch } from "../src/agents/dailyPitch.js";
import { repurpose } from "../src/agents/repurpose.js";
import { review, heuristicReview } from "../src/agents/reviewer.js";
import { PROMPT_VERSION } from "../src/agents/prompts.js";
import type { OwnedAsset, Pillar, RetrievedChunk } from "../src/types.js";

const now = new Date();
function pillar(id: number, name: string): Pillar {
  return {
    id,
    brand_id: 1,
    name,
    description: `${name} desc`,
    active: true,
    intent: "authority",
    conversion_target: null,
  };
}
function asset(id: number, pillarHint: number, title: string, text: string): OwnedAsset {
  return {
    id,
    brand_id: 1,
    source_type: "manual",
    source_ref: `seed:${title}`,
    title,
    chunk_text: text,
    chunk_index: 0,
    content_hash: "h",
    pillar_hint: pillarHint,
    last_used_at: null,
    updated_at: now,
  };
}
function chunk(a: OwnedAsset, sim: number): RetrievedChunk {
  return { ...a, similarity: sim };
}

const llm = new MockLLM();
const pillars = [pillar(1, "Skills-based hiring"), pillar(2, "Employability outcomes")];
const candidates = [
  asset(10, 1, "Hiring briefing", "Skills over degrees in hiring."),
  asset(11, 2, "Outcomes case", "Applied projects convert interviews to offers."),
];

describe("Daily Pitch agent (§4.1)", () => {
  it("returns exactly two options grounded in real candidate asset ids", async () => {
    const pitch = await generatePitch({ pillars, candidates }, llm);
    expect(pitch.A).toBeDefined();
    expect(pitch.B).toBeDefined();
    const ids = candidates.map((c) => c.id);
    expect(ids).toContain(pitch.A.asset_id);
    expect(ids).toContain(pitch.B.asset_id);
    // Prefers different pillars for A and B.
    expect(pitch.A.pillar).not.toBe(pitch.B.pillar);
  });
});

describe("Repurposing agent (§4 / §17.3)", () => {
  it("produces a body, variants, and claims traced to source", async () => {
    const out = await repurpose(
      {
        voiceGuide: "grounded, no hype",
        angle: "Why skills beat degrees in hiring",
        pillar: "Skills-based hiring",
        chunks: [chunk(candidates[0]!, 0.9)],
      },
      llm,
    );
    expect(out.body.length).toBeGreaterThan(20);
    expect(Array.isArray(out.variants)).toBe(true);
    expect(out.modelUsed).toContain("mock");
    // Asserted against the constant, not a literal — bumping PROMPT_VERSION is
    // a deliberate act (it's how prompt changes become measurable, see
    // src/eval), and shouldn't break an unrelated test every time.
    expect(out.promptVersion).toBe(PROMPT_VERSION);
  });
});

describe("Brand-Safety Reviewer (§10 / §17.4)", () => {
  it("passes a clean draft via the mock LLM", async () => {
    const result = await review(
      {
        draft: "A grounded, specific post about employability outcomes.",
        claimsUsed: ["Source: Outcomes case"],
        chunks: [chunk(candidates[1]!, 0.8)],
        bannedTopics: ["politics"],
        voiceGuide: "grounded",
      },
      llm,
    );
    expect(result.verdict).toBe("pass");
  });

  it("heuristic gate flags engagement-bait, buzzwords, and banned topics", () => {
    expect(heuristicReview({ draft: "Big news. Agree? 👇", bannedTopics: [] }).verdict).toBe("flag");
    expect(
      heuristicReview({ draft: "A revolutionary game-changer.", bannedTopics: [] }).flags.length,
    ).toBeGreaterThan(0);
    const banned = heuristicReview({
      draft: "Our take on the election results.",
      bannedTopics: ["election"],
    });
    expect(banned.verdict).toBe("flag");
    expect(banned.flags.some((f) => f.includes("election"))).toBe(true);
  });

  it("heuristic gate passes clean copy", () => {
    expect(
      heuristicReview({
        draft: "Task-based assessment predicts on-the-job performance better than quizzes.",
        bannedTopics: ["politics"],
      }).verdict,
    ).toBe("pass");
  });
});

describe("parseJson salvage", () => {
  it("recovers JSON wrapped in prose", () => {
    const out = parseJson<{ verdict: string }>('Sure! {"verdict":"pass"} done', "test");
    expect(out.verdict).toBe("pass");
  });
  it("throws a descriptive error on garbage", () => {
    expect(() => parseJson("not json at all", "ctx")).toThrow(/ctx/);
  });
});
