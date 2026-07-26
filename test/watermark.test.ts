import { describe, expect, it } from "vitest";
import { Jimp } from "jimp";
import { applyLogoWatermark } from "../src/images/watermark.js";

async function solidPng(width: number, height: number, color: number): Promise<Buffer> {
  const img = new Jimp({ width, height, color });
  return img.getBuffer("image/png");
}

describe("applyLogoWatermark (LinkedIn multi-image follow-up)", () => {
  it("composites the logo onto the bottom-right corner without changing image dimensions", async () => {
    const baseData = await solidPng(200, 100, 0x1050ffff); // opaque blue
    const logoData = await solidPng(40, 40, 0xff0000ff); // opaque red

    const result = await applyLogoWatermark(
      { mimeType: "image/png", data: baseData, modelUsed: "test" },
      { mimeType: "image/png", data: logoData },
    );

    const out = await Jimp.fromBuffer(result.data);
    expect(out.width).toBe(200);
    expect(out.height).toBe(100);

    // Top-left corner is untouched (still the base's blue).
    const topLeft = out.getPixelColor(0, 0);
    expect(topLeft).toBe(0x1050ffff);

    // Somewhere inside the logo's bottom-right placement now shows the
    // composited logo (red), not the base's blue — the logo is inset by a
    // margin, so the very last pixel (199, 99) is outside its bounds.
    const withinLogo = out.getPixelColor(180, 80);
    expect(withinLogo).not.toBe(0x1050ffff);
  });

  it("falls back to the original image if compositing fails (corrupt logo bytes)", async () => {
    const baseData = await solidPng(50, 50, 0x00ff00ff);
    const original = { mimeType: "image/png", data: baseData, modelUsed: "test" };

    const result = await applyLogoWatermark(original, {
      mimeType: "image/png",
      data: Buffer.from("not a real image"),
    });

    expect(result).toBe(original);
  });
});
