import { config } from "../config.js";
import { logger } from "../logger.js";
import { OpenAiImageGenerator } from "./openai.js";
import { OpenRouterImageGenerator } from "./openrouter.js";
import { MockImageGenerator } from "./mock.js";
import type { ImageGenerator } from "./types.js";

export * from "./types.js";

let generator: ImageGenerator | null = null;

/** Resolve the configured image provider; fall back to the mock if creds are missing. */
export function getImageGenerator(): ImageGenerator {
  if (generator) return generator;
  try {
    switch (config.image.provider) {
      case "openrouter":
        generator = new OpenRouterImageGenerator();
        break;
      case "openai":
        generator = new OpenAiImageGenerator();
        break;
      default:
        generator = new MockImageGenerator();
    }
  } catch (err) {
    logger.warn({ err, provider: config.image.provider }, "image generator init failed — using mock");
    generator = new MockImageGenerator();
  }
  logger.info({ provider: generator.name }, "image generator ready");
  return generator;
}

/** For tests: inject a provider (e.g. a scripted fake). */
export function setImageGenerator(g: ImageGenerator): void {
  generator = g;
}

/** Self-hosted media URL — served by api/media/[id].ts, fetchable by Ayrshare. */
export function buildMediaUrl(assetId: number): string {
  return `${config.publicBaseUrl}/api/media/${assetId}`;
}
