import { describe, expect, it } from "vitest";
import { MockLLM } from "../src/llm/mock.js";
import { clarifyTopic } from "../src/agents/clarify.js";
import { clarifyPrompt } from "../src/agents/prompts.js";

describe("clarifyTopic (§20 pre-draft check)", () => {
  it("mock mode always reports sufficient, so offline/CI is never blocked", async () => {
    const result = await clarifyTopic(
      { topic: "a vague thing", platforms: ["linkedin"] },
      new MockLLM(),
    );
    expect(result.sufficient).toBe(true);
    expect(result.questions).toEqual([]);
  });

  it("caps questions at 2 even if the LLM returns more", async () => {
    const llm = new MockLLM();
    const original = llm.complete.bind(llm);
    llm.complete = async (input) =>
      original({
        ...input,
        mockResult: JSON.stringify({
          sufficient: false,
          questions: [
            { platform: "linkedin", question: "Q1?" },
            { platform: "x", question: "Q2?" },
            { platform: "instagram", question: "Q3?" },
          ],
        }),
      });
    const result = await clarifyTopic({ topic: "vague", platforms: ["linkedin", "x", "instagram"] }, llm);
    expect(result.sufficient).toBe(false);
    expect(result.questions).toHaveLength(2);
  });
});

describe("clarifyPrompt", () => {
  it("includes the topic, platforms, and any must-say/why-now context", () => {
    const { user } = clarifyPrompt({
      topic: "skills gap",
      platforms: ["linkedin", "x"],
      mustSay: "mention the pilot",
      whyNow: "just launched",
    });
    expect(user).toContain("skills gap");
    expect(user).toContain("linkedin, x");
    expect(user).toContain("mention the pilot");
    expect(user).toContain("just launched");
  });
});
