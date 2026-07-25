import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { resolveBrandId } from "../_lib/brand.js";
import { logger } from "../../src/logger.js";
import { pillars } from "../../src/db/repositories/index.js";

/**
 * GET /api/pillars — active pillars for the default brand (§12.1).
 * POST /api/pillars { name, description? } — add a pillar (audit Phase 1:
 * this was read-only in the dashboard, requiring a DB edit to change).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const me = requireAuth(req, res);
  if (!me) return;

  if (req.method === "GET") {
    try {
      const brandId = await resolveBrandId();
      // ?all=true (management view) includes deactivated pillars; the default
      // (topic-creation pickers) only ever offers active ones.
      const rows =
        req.query.all === "true" ? await pillars.listAll(brandId) : await pillars.listActive(brandId);
      res.status(200).json({ ok: true, pillars: rows });
    } catch (err) {
      logger.error({ err }, "pillars list failed");
      res.status(500).json({ error: "internal error" });
    }
    return;
  }

  if (req.method === "POST") {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    try {
      const brandId = await resolveBrandId();
      const pillar = await pillars.create({
        brand_id: brandId,
        name,
        description: typeof req.body?.description === "string" ? req.body.description : undefined,
      });
      res.status(200).json({ ok: true, pillar });
    } catch (err) {
      logger.error({ err }, "pillar create failed");
      res.status(500).json({ error: "internal error" });
    }
    return;
  }

  res.status(405).json({ error: "method not allowed" });
}
