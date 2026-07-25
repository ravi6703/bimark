import { describe, expect, it } from "vitest";
import { chunkText } from "../src/rag/chunk.js";

describe("chunkText (§18.3)", () => {
  it("returns a single chunk for short text", () => {
    const chunks = chunkText("A short paragraph about skills-based hiring.");
    expect(chunks.length).toBe(1);
  });

  it("splits long text into multiple coherent chunks", () => {
    const para = Array.from({ length: 40 }, (_, i) => `sentence number ${i} about outcomes`).join(
      " ",
    );
    const doc = `${para}\n\n${para}\n\n${para}`;
    const chunks = chunkText(doc, { targetTokens: 100, maxTokens: 130, overlapTokens: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeGreaterThan(0);
  });

  it("hard-splits a single oversized segment", () => {
    const huge = Array.from({ length: 2000 }, (_, i) => `w${i}`).join(" ");
    const chunks = chunkText(huge, { targetTokens: 200, maxTokens: 260 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("handles empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });
});
