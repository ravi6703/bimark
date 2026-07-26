import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../_lib/requireAuth.js";
import { resolveBrandId } from "../../_lib/brand.js";
import { logger } from "../../../src/logger.js";
import { geoProbeQueries } from "../../../src/db/repositories/index.js";

/**
 * GET /api/geo/probe-queries — this brand's real questions used to check GEO
 * citation (Okara-comparison follow-up). Nothing is auto-seeded — the team
 * writes the actual questions a prospective customer might ask an AI answer
 * engine, same manual-first posture as competitor notes.
 *
 * POST /api/geo/probe-queries { query_text } — add one.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;

  if (req.method === "GET") {
    try {
      const brandId = await resolveBrandId(req);
      const queries = await geoProbeQueries.list(brandId);
      res.status(200).json({ ok: true, queries });
    } catch (err) {
      logger.error({ err }, "geo probe query list failed");
      res.status(500).json({ error: "internal error" });
    }
    return;
  }

  if (req.method === "POST") {
    const queryText = typeof req.body?.query_text === "string" ? req.body.query_text.trim() : "";
    if (!queryText) {
      res.status(400).json({ error: "query_text is required" });
      return;
    }
    try {
      const brandId = await resolveBrandId(req);
      const query = await geoProbeQueries.create({ brand_id: brandId, query_text: queryText });
      res.status(200).json({ ok: true, query });
    } catch (err) {
      logger.error({ err }, "geo probe query create failed");
      res.status(500).json({ error: "internal error" });
    }
    return;
  }

  res.status(405).json({ error: "method not allowed" });
}
