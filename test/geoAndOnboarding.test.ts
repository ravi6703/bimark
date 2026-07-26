import { describe, expect, it } from "vitest";
import { MockLLM } from "../src/llm/mock.js";
import { repurpose } from "../src/agents/repurpose.js";
import { onboardingPrompt } from "../src/agents/prompts.js";
import { proposeBrandProfile } from "../src/agents/onboarding.js";
import { computeGeoReadiness } from "../src/geo/readiness.js";
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

describe("GEO content format (Okara-inspired follow-up)", () => {
  it("repurpose() drafts GEO content without applying X's 280-char truncation", async () => {
    const out = await repurpose(
      {
        voiceGuide: "grounded, no hype",
        angle: "What is skills-based hiring?",
        pillar: "Skills-based hiring",
        chunks: [chunk("Skills-based hiring evaluates real task performance over degrees.")],
        platform: "geo",
      },
      llm,
    );
    expect(out.body.length).toBeGreaterThan(20);
    // The mock draft for a non-"x" platform isn't hard-truncated to 280 chars.
    expect(out.body).not.toMatch(/…$/);
  });
});

describe("AI-derived onboarding (Okara-inspired)", () => {
  it("onboardingPrompt includes the URL and a truncated slice of the page text", () => {
    const longText = "a".repeat(10000);
    const { system, user } = onboardingPrompt({ url: "https://example.com", pageText: longText });
    expect(system).toContain("brand strategist");
    expect(user).toContain("https://example.com");
    // Truncated to 6000 chars inside the prompt builder, not the full 10000.
    expect(user.length).toBeLessThan(10000);
  });

  it("proposeBrandProfile returns a well-shaped proposal via the mock LLM", async () => {
    const proposal = await proposeBrandProfile(
      { url: "https://example.com", pageText: "We help universities run skills-based hiring." },
      llm,
    );
    expect(typeof proposal.voiceGuide).toBe("string");
    expect(proposal.voiceGuide.length).toBeGreaterThan(0);
    expect(Array.isArray(proposal.bannedTopics)).toBe(true);
    expect(Array.isArray(proposal.pillars)).toBe(true);
    expect(proposal.pillars.length).toBeGreaterThan(0);
    expect(proposal.pillars[0]).toHaveProperty("name");
    expect(proposal.pillars[0]).toHaveProperty("description");
  });
});

describe("GEO readiness self-check (Okara-inspired follow-up)", () => {
  const goodBody =
    "Skills-based hiring evaluates candidates by demonstrated task performance rather than degree pedigree. " +
    "Employers using structured skill assessments report better early job-performance predictions than resume " +
    "screens alone. Three practices define the approach: naming the four or five skills a role actually " +
    "requires, testing them with a realistic task instead of a quiz, and giving candidates feedback so the " +
    "assessment itself builds goodwill rather than just filtering.\n\n" +
    "The shift matters most for roles where credentials are a weak proxy for capability, and it gives employers " +
    "a defensible, evidence-led reason to consider candidates a pure resume screen would filter out.";

  it("scores a well-formed direct-answer piece with sourced claims highly", () => {
    const r = computeGeoReadiness(goodBody, ["Source: hiring briefing"]);
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.checks.find((c) => c.label.includes("direct answer"))?.pass).toBe(true);
    expect(r.checks.find((c) => c.label.includes("traced back"))?.pass).toBe(true);
  });

  it("penalizes a hedging opener, no sourced claims, and engagement-bait", () => {
    const bad = "In today's world, everything is changing fast. Agree? 👇";
    const r = computeGeoReadiness(bad, []);
    expect(r.score).toBeLessThan(50);
    expect(r.checks.find((c) => c.label.includes("direct answer"))?.pass).toBe(false);
    expect(r.checks.find((c) => c.label.includes("traced back"))?.pass).toBe(false);
    expect(r.checks.find((c) => c.label.includes("engagement-bait"))?.pass).toBe(false);
  });
});
