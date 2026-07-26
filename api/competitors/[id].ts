import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { resolveBrandId } from "../_lib/brand.js";
import { logger } from "../../src/logger.js";
import { competitorNotes } from "../../src/db/repositories/index.js";

/** DELETE /api/competitors/:id — remove a competitor note (fix a mistake). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "DELETE") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid note id" });
    return;
  }
  try {
    const brandId = await resolveBrandId();
    const deleted = await competitorNotes.delete(id, brandId);
    if (!deleted) {
      res.status(404).json({ error: "note not found" });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error({ err, id }, "competitor note delete failed");
    res.status(500).json({ error: "internal error" });
  }
}
