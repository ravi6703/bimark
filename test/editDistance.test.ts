import { describe, expect, it } from "vitest";
import { editDistance, normalizedEditDistance } from "../src/metrics/editDistance.js";

describe("editDistance (§7 metric)", () => {
  it("is zero for identical strings", () => {
    expect(editDistance("hello", "hello")).toBe(0);
  });

  it("equals the other length when one string is empty", () => {
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("abcd", "")).toBe(4);
  });

  it("counts single-character edits", () => {
    expect(editDistance("kitten", "sitting")).toBe(3); // classic example
    expect(editDistance("flaw", "lawn")).toBe(2);
  });

  it("is symmetric", () => {
    expect(editDistance("abcdef", "azced")).toBe(editDistance("azced", "abcdef"));
  });

  it("normalized distance is in [0,1]", () => {
    expect(normalizedEditDistance("abc", "abc")).toBe(0);
    expect(normalizedEditDistance("abc", "xyz")).toBe(1);
    const n = normalizedEditDistance("kitten", "sitting");
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(1);
  });
});
