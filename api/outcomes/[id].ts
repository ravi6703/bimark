import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { resolveBrandId } from "../_lib/brand.js";
import { logger } from "../../src/logger.js";
import { outcomes } from "../../src/db/repositories/index.js";

/** DELETE /api/outcomes/:id — remove a mis-entered result (Move 1). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "DELETE") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const id = Number(req.query.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  try {
    // Scoped by brand so a stale brand switch can't delete another
    // workspace's numbers.
    const brandId = await resolveBrandId(req);
    const removed = await outcomes.remove(id, brandId);
    if (!removed) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error({ err }, "outcome delete failed");
    res.status(500).json({ error: "internal error" });
  }
}
