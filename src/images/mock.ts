import type { GeneratedImage, ImageGenerator } from "./types.js";

/** A minimal valid 1x1 PNG, used so the offline pipeline exercises real image bytes. */
const PLACEHOLDER_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

/** Deterministic, offline image generator — mirrors src/llm/mock.ts. */
export class MockImageGenerator implements ImageGenerator {
  readonly name = "mock";

  async generate(_prompt: string): Promise<GeneratedImage> {
    return {
      mimeType: "image/png",
      data: Buffer.from(PLACEHOLDER_PNG_B64, "base64"),
      modelUsed: "mock:image",
    };
  }
}
