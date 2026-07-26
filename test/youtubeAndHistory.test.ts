import { describe, expect, it } from "vitest";
import { MockLLM } from "../src/llm/mock.js";
import { repurpose } from "../src/agents/repurpose.js";
import { repurposePrompt } from "../src/agents/prompts.js";
import type { OwnedAsset, RetrievedChunk } from "../src/types.js";

const now = new Date();
function chunk(text: string): RetrievedChunk {
  const a: OwnedAsset = {
    id: 1,
    brand_id: 1,
    source_type: "manual",
    source_ref: "seed:x",
    title: "Source",
    chunk_text: text,
    chunk_index: 0,
    content_hash: "h",
    pillar_hint: null,
    last_used_at: null,
    updated_at: now,
  };
  return { ...a, similarity: 0.9 };
}

const llm = new MockLLM();

describe("YouTube platform (Okara-inspired follow-up — script, not a finished video)", () => {
  it("repurpose() drafts a YouTube script without X's 280-char truncation", async () => {
    const out = await repurpose(
      {
        voiceGuide: "grounded, no hype",
        angle: "What is skills-based hiring?",
        pillar: "Skills-based hiring",
        chunks: [chunk("Skills-based hiring evaluates real task performance over degrees.")],
        platform: "youtube",
      },
      llm,
    );
    expect(out.body.length).toBeGreaterThan(20);
    expect(out.body).not.toMatch(/…$/);
  });

  it("platformSpec instructs a script structure, not a social caption", () => {
    const { user } = repurposePrompt({
      voiceGuide: "grounded",
      angle: "What is skills-based hiring?",
      pillar: "Skills-based hiring",
      retrievedChunks: "[S1] some source text",
      platform: "youtube",
    });
    expect(user).toContain("TITLE:");
    expect(user).toContain("TALKING POINTS");
    expect(user).toContain("no video-generation pipeline");
  });
});

describe("Historical context in generation (Okara-inspired follow-up, \"show previous data\")", () => {
  it("folds recentAngles into the prompt as a don't-repeat instruction", () => {
    const { user } = repurposePrompt({
      voiceGuide: "grounded",
      angle: "New angle on skills-based hiring",
      pillar: "Skills-based hiring",
      retrievedChunks: "[S1] some source text",
      platform: "linkedin",
      recentAngles: ["Why skills beat degrees", "The cost of resume-only screening"],
    });
    expect(user).toContain("RECENTLY COVERED");
    expect(user).toContain("Why skills beat degrees");
    expect(user).toContain("The cost of resume-only screening");
  });

  it("omits the recently-covered section when there's no history yet", () => {
    const { user } = repurposePrompt({
      voiceGuide: "grounded",
      angle: "First post on this pillar",
      pillar: "Skills-based hiring",
      retrievedChunks: "[S1] some source text",
      platform: "linkedin",
      recentAngles: [],
    });
    expect(user).not.toContain("RECENTLY COVERED");
  });
});
