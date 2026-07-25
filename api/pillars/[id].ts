import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { logger } from "../../src/logger.js";
import { pillars } from "../../src/db/repositories/index.js";

/** PATCH /api/pillars/:id { name?, description?, active? } — edit or retire a pillar. */
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
  try {
    const pillar = await pillars.update(id, {
      name: typeof req.body?.name === "string" ? req.body.name.trim() : undefined,
      description: typeof req.body?.description === "string" ? req.body.description : undefined,
      active: typeof req.body?.active === "boolean" ? req.body.active : undefined,
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
