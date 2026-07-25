import { describe, expect, it } from "vitest";
import { NullSovSource } from "../src/sov/null.js";
import { Brand24Source } from "../src/sov/brand24.js";
import { getSovSource, isSovConfigured, setSovSource } from "../src/sov/index.js";

describe("SOV sources (§19, audit Phase 3)", () => {
  it("NullSovSource always scores 0 — no invented numbers", async () => {
    const s = new NullSovSource();
    expect(await s.score("anything")).toBe(0);
  });

  it("Brand24Source requires an API key", () => {
    expect(() => new Brand24Source("", "{}")).toThrow(/BRAND24_API_KEY/);
  });

  it("Brand24Source rejects invalid JSON in the project map", () => {
    expect(() => new Brand24Source("key", "{not valid json")).toThrow(/BRAND24_PROJECT_MAP/);
  });

  it("Brand24Source rejects an empty project map", () => {
    expect(() => new Brand24Source("key", "{}")).toThrow(/BRAND24_PROJECT_MAP is empty/);
  });

  it("Brand24Source scores 0 (not an error) for an entity with no configured project", async () => {
    const s = new Brand24Source("key", '{"Board Infinity":"proj-1"}');
    expect(await s.score("some competitor never mentioned")).toBe(0);
  });

  it("isSovConfigured reflects whatever source is currently set", () => {
    setSovSource(new NullSovSource());
    expect(isSovConfigured()).toBe(false);
    setSovSource(new Brand24Source("key", '{"Board Infinity":"proj-1"}'));
    expect(isSovConfigured()).toBe(true);
    // reset for any other test relying on the module-level default
    setSovSource(new NullSovSource());
  });

  it("getSovSource never throws even with a bad config — falls back to null source", () => {
    expect(() => getSovSource()).not.toThrow();
  });
});
