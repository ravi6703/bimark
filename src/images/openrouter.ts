import { config } from "../config.js";
import type { GeneratedImage, ImageGenerator } from "./types.js";

/**
 * OpenRouter image generation (§20). Unlike OpenAI's dedicated images endpoint,
 * OpenRouter serves image-capable models through chat completions: request
 * `modalities: ["image","text"]` and the image comes back as a data URL in
 * `message.images[0].image_url.url`.
 * https://openrouter.ai/docs — image generation via chat completions.
 */
export class OpenRouterImageGenerator implements ImageGenerator {
  readonly name = "openrouter";

  constructor(
    private apiKey = config.image.openrouter.apiKey,
    private model = config.image.provider === "openrouter"
      ? config.image.model
      : "google/gemini-2.5-flash-image",
  ) {
    if (!apiKey) throw new Error("OpenRouterImageGenerator requires OPENROUTER_API_KEY");
  }

  async generate(prompt: string): Promise<GeneratedImage> {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });
    if (!res.ok) {
      throw new Error(`openrouter image generation failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
    };
    const dataUrl = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl) throw new Error("openrouter image generation returned no image data");

    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    if (!match) throw new Error("openrouter image generation returned an unexpected image format");
    return { mimeType: match[1]!, data: Buffer.from(match[2]!, "base64"), modelUsed: this.model };
  }
}
