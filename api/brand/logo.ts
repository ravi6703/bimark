import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { resolveBrandId } from "../_lib/brand.js";
import { logger } from "../../src/logger.js";
import { brands } from "../../src/db/repositories/index.js";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 3 * 1024 * 1024; // 3MB decoded — comfortably under Vercel's request-body cap

/**
 * GET /api/brand/logo?brandId= — serves the brand's real logo (LinkedIn
 * multi-image follow-up), used to watermark generated images. Deliberately
 * unauthenticated and keyed by an explicit brandId, same posture as
 * /api/media/[id].ts: the dashboard's <img> preview needs it, and there's
 * nothing sensitive in a company logo.
 *
 * POST /api/brand/logo { data: base64, mime_type } — upload/replace the
 * selected brand's logo (resolved from x-brand-id like the rest of
 * /api/brand). Authenticated — this is a write.
 *
 * DELETE /api/brand/logo — remove the selected brand's logo.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    const brandId = Number(req.query.brandId);
    if (!Number.isInteger(brandId) || brandId <= 0) {
      res.status(400).json({ error: "invalid brandId" });
      return;
    }
    const brand = await brands.get(brandId);
    if (!brand?.logo_data) {
      res.status(404).json({ error: "no logo set for this brand" });
      return;
    }
    res.setHeader("content-type", brand.logo_mime_type ?? "image/png");
    res.setHeader("cache-control", "public, max-age=300");
    res.status(200).send(brand.logo_data);
    return;
  }

  if (!requireAuth(req, res)) return;

  if (req.method === "POST") {
    try {
      const mimeType = typeof req.body?.mime_type === "string" ? req.body.mime_type : "";
      const b64 = typeof req.body?.data === "string" ? req.body.data : "";
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        res.status(400).json({ error: "mime_type must be image/png, image/jpeg, or image/webp" });
        return;
      }
      if (!b64) {
        res.status(400).json({ error: "data (base64) is required" });
        return;
      }
      const data = Buffer.from(b64, "base64");
      if (data.length === 0 || data.length > MAX_BYTES) {
        res.status(400).json({ error: `logo must be under ${Math.round(MAX_BYTES / 1024 / 1024)}MB` });
        return;
      }
      const brandId = await resolveBrandId(req);
      const brand = await brands.setLogo(brandId, mimeType, data);
      if (!brand) {
        res.status(404).json({ error: "no brand configured" });
        return;
      }
      res.status(200).json({ ok: true, brandId });
    } catch (err) {
      logger.error({ err }, "brand logo upload failed");
      res.status(500).json({ error: "internal error" });
    }
    return;
  }

  if (req.method === "DELETE") {
    try {
      const brandId = await resolveBrandId(req);
      await brands.clearLogo(brandId);
      res.status(200).json({ ok: true });
    } catch (err) {
      logger.error({ err }, "brand logo delete failed");
      res.status(500).json({ error: "internal error" });
    }
    return;
  }

  res.status(405).json({ error: "method not allowed" });
}
