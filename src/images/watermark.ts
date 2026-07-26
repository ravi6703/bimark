import { Jimp } from "jimp";
import { logger } from "../logger.js";
import type { GeneratedImage } from "./types.js";

export interface BrandLogo {
  mimeType: string;
  data: Buffer;
}

/**
 * Composites the brand's real logo onto the bottom-right corner of a
 * generated image. Only ever called when a brand actually has a logo
 * uploaded (brands.logo_data) — there is no placeholder/fabricated mark,
 * same honesty posture as the rest of this app. Best-effort: a compositing
 * failure returns the image unmarked rather than losing the draft's image
 * entirely, matching how image generation itself is treated in WF-4.
 */
export async function applyLogoWatermark(
  image: GeneratedImage,
  logo: BrandLogo,
): Promise<GeneratedImage> {
  try {
    const base = await Jimp.fromBuffer(image.data);
    const mark = await Jimp.fromBuffer(logo.data);

    const targetWidth = Math.max(1, Math.round(base.width * 0.16));
    mark.resize({ w: targetWidth });

    const margin = Math.round(base.width * 0.035);
    const x = base.width - mark.width - margin;
    const y = base.height - mark.height - margin;
    base.composite(mark, Math.max(0, x), Math.max(0, y));

    const mimeType = image.mimeType === "image/png" ? "image/png" : "image/jpeg";
    const data = await base.getBuffer(mimeType);
    return { mimeType, data, modelUsed: image.modelUsed };
  } catch (err) {
    logger.warn({ err }, "logo watermark compositing failed — using the image without it");
    return image;
  }
}
