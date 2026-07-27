import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { logger } from "../../src/logger.js";
import { pillars } from "../../src/db/repositories/index.js";

/**
 * PATCH /api/pillars/:id { name?, description?, active?, intent?, conversion_target? }
 * — edit or retire a pillar.
 *
 * `intent` (Move 4) decides whether posts on this pillar offer a next step at
 * all. Switching to 'authority' clears any conversion_target, so a retired
 * offer can't keep leaking into generated copy.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "PATCH") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid pillar id" });
    return;
  }
  const intent = req.body?.intent;
  if (intent != null && intent !== "authority" && intent !== "conversion") {
    res.status(400).json({ error: "intent must be authority or conversion" });
    return;
  }
  try {
    const pillar = await pillars.update(id, {
      name: typeof req.body?.name === "string" ? req.body.name.trim() : undefined,
      description: typeof req.body?.description === "string" ? req.body.description : undefined,
      active: typeof req.body?.active === "boolean" ? req.body.active : undefined,
      intent: intent ?? undefined,
      conversion_target:
        intent === "authority"
          ? null
          : typeof req.body?.conversion_target === "string"
            ? req.body.conversion_target.trim() || null
            : undefined,
    });
    if (!pillar) {
      res.status(404).json({ error: "pillar not found" });
      return;
    }
    res.status(200).json({ ok: true, pillar });
  } catch (err) {
    logger.error({ err, id }, "pillar update failed");
    res.status(500).json({ error: "internal error" });
  }
}
