import type { VercelRequest, VercelResponse } from "@vercel/node";
import { mediaAssets } from "../../src/db/repositories/index.js";

/**
 * GET /api/media/:id — serves a generated image (§20). Deliberately unauthenticated:
 * Ayrshare's servers fetch this URL directly when publishing, and the dashboard's
 * <img> preview needs it too. Asset ids are opaque and not enumerable in bulk.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid media id" });
    return;
  }
  const asset = await mediaAssets.get(id);
  if (!asset) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.setHeader("content-type", asset.mime_type);
  res.setHeader("cache-control", "public, max-age=31536000, immutable");
  res.status(200).send(asset.data);
}
