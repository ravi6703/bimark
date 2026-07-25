import { describe, expect, it } from "vitest";
import { MockImageGenerator } from "../src/images/mock.js";
import { buildMediaUrl } from "../src/images/index.js";
import { imagePrompt } from "../src/agents/prompts.js";

describe("Image generation (§20)", () => {
  it("MockImageGenerator returns deterministic, decodable PNG bytes", async () => {
    const gen = new MockImageGenerator();
    const a = await gen.generate("a photo of a skills assessment");
    const b = await gen.generate("a completely different prompt");
    expect(a.mimeType).toBe("image/png");
    expect(a.data.length).toBeGreaterThan(0);
    // PNG magic bytes.
    expect(a.data.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(a.data.equals(b.data)).toBe(true);
  });

  it("imagePrompt includes the angle, pillar, and visual notes when present", () => {
    const p = imagePrompt({ angle: "skills over degrees", pillar: "Skills-based hiring", visualNotes: "warm tones" });
    expect(p).toContain("skills over degrees");
    expect(p).toContain("Skills-based hiring");
    expect(p).toContain("warm tones");
  });

  it("imagePrompt omits empty optional fields cleanly", () => {
    const p = imagePrompt({ angle: "an idea", pillar: "", visualNotes: null });
    expect(p).toContain("an idea");
    expect(p).not.toContain("Theme:");
    expect(p).not.toContain("Visual style notes:");
  });

  it("buildMediaUrl points at the self-hosted media endpoint", () => {
    expect(buildMediaUrl(42)).toMatch(/\/api\/media\/42$/);
  });
});
