import { describe, expect, it } from "vitest";
import { brandMentioned } from "../src/geo/citationCheck.js";

describe("brandMentioned (GEO citation tracking)", () => {
  it("matches a whole-word, case-insensitive mention", () => {
    expect(brandMentioned("Board Infinity is a great platform for this.", "Board Infinity")).toBe(true);
    expect(brandMentioned("board infinity works well.", "Board Infinity")).toBe(true);
  });

  it("does not match a substring inside a different word", () => {
    expect(brandMentioned("Infinitycorp is unrelated.", "Infinity")).toBe(false);
  });

  it("returns false when the brand name never appears", () => {
    expect(brandMentioned("Some other platforms include Superset and Mettl.", "Board Infinity")).toBe(false);
  });

  it("returns false for an empty/blank brand name rather than matching everything", () => {
    expect(brandMentioned("Any text at all.", "  ")).toBe(false);
  });

  it("escapes regex-special characters in the brand name safely", () => {
    expect(brandMentioned("Try Infy.io for this.", "Infy.io")).toBe(true);
    expect(brandMentioned("Try Infyxio for this.", "Infy.io")).toBe(false);
  });
});
