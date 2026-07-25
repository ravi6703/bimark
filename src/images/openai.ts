import { config } from "../config.js";
import type { GeneratedImage, ImageGenerator } from "./types.js";

/**
 * OpenAI image generation (§20). gpt-image-1 always returns base64-encoded
 * PNG data (no hosted `url` option), so callers store the bytes themselves —
 * see src/db/repositories/index.ts#mediaAssets and api/media/[id].ts.
 */
export class OpenAiImageGenerator implements ImageGenerator {
  readonly name = "openai";

  constructor(
    private apiKey = config.image.openai.apiKey,
    private model = config.image.provider === "openai" ? config.image.model : "gpt-image-1",
    private size = config.image.size,
  ) {
    if (!apiKey) throw new Error("OpenAiImageGenerator requires OPENAI_API_KEY");
  }

  async generate(prompt: string): Promise<GeneratedImage> {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: this.model, prompt, size: this.size, n: 1 }),
    });
    if (!res.ok) {
      throw new Error(`openai image generation failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { data: { b64_json?: string }[] };
    const b64 = json.data[0]?.b64_json;
    if (!b64) throw new Error("openai image generation returned no image data");
    return { mimeType: "image/png", data: Buffer.from(b64, "base64"), modelUsed: this.model };
  }
}
