import { describe, expect, it } from "vitest";
import { MockEmbedder, cosine, l2normalize, tokenize } from "../src/rag/embed.js";

describe("MockEmbedder (deterministic offline embeddings)", () => {
  const embedder = new MockEmbedder(256);

  it("is deterministic", async () => {
    const [a] = await embedder.embed(["skills-based hiring outcomes"]);
    const [b] = await embedder.embed(["skills-based hiring outcomes"]);
    expect(a).toEqual(b);
  });

  it("produces unit-length vectors of the configured dimension", async () => {
    const [v] = await embedder.embed(["applied assessment rubric"]);
    expect(v!.length).toBe(256);
    const norm = Math.sqrt(v!.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("ranks shared-vocabulary text as more similar (retrieval sanity)", async () => {
    const [query] = await embedder.embed(["skills based hiring assessment"]);
    const [related] = await embedder.embed([
      "hiring for skills using a realistic assessment task",
    ]);
    const [unrelated] = await embedder.embed(["a poem about the monsoon and mangoes"]);
    expect(cosine(query!, related!)).toBeGreaterThan(cosine(query!, unrelated!));
  });

  it("avoids a zero vector for empty text", async () => {
    const [v] = await embedder.embed([""]);
    expect(v!.some((x) => x !== 0)).toBe(true);
  });
});

describe("vector helpers", () => {
  it("tokenize drops short tokens and punctuation", () => {
    expect(tokenize("The skills-gap, in 2026!")).toEqual(["the", "skills", "gap", "2026"]);
  });
  it("l2normalize yields a unit vector", () => {
    const v = l2normalize([3, 4]);
    expect(Math.sqrt(v[0]! ** 2 + v[1]! ** 2)).toBeCloseTo(1, 6);
  });
});
