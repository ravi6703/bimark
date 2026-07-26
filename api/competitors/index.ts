import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { resolveBrandId } from "../_lib/brand.js";
import { logger } from "../../src/logger.js";
import { competitorNotes, sov } from "../../src/db/repositories/index.js";
import { DEFAULT_COMPETITORS, isSovConfigured } from "../../src/workflows/wf7_sovMemo.js";
import { groupCompetitorNotes } from "../../src/competitors/group.js";

/**
 * GET /api/competitors — competitor intelligence log (Okara-inspired
 * follow-up), grouped by competitor. This is a MANUAL log — there's no
 * scraping/monitoring source wired up to auto-populate it (that's a vendor
 * decision, same class of call Brand24 was for SOV) — so it only reflects
 * whatever the team has recorded. Real SOV numbers (when configured) are
 * attached per competitor from the same snapshot the editorial memo uses.
 *
 * POST /api/competitors { competitor_name, summary, learning?, source_url? }
 * — log a new note.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const me = requireAuth(req, res);
  if (!me) return;

  if (req.method === "GET") {
    try {
      const brandId = await resolveBrandId();
      const [notes, latestSov] = await Promise.all([
        competitorNotes.list(brandId),
        isSovConfigured() ? sov.latestCompetitorScores(brandId) : Promise.resolve(null),
      ]);
      const groups = groupCompetitorNotes(DEFAULT_COMPETITORS, notes, latestSov?.scores ?? null);
      res.status(200).json({
        ok: true,
        competitors: groups,
        sovConfigured: isSovConfigured(),
        sovCapturedAt: latestSov?.capturedAt ?? null,
      });
    } catch (err) {
      logger.error({ err }, "competitors list failed");
      res.status(500).json({ error: "internal error" });
    }
    return;
  }

  if (req.method === "POST") {
    const competitorName =
      typeof req.body?.competitor_name === "string" ? req.body.competitor_name.trim() : "";
    const summary = typeof req.body?.summary === "string" ? req.body.summary.trim() : "";
    if (!competitorName || !summary) {
      res.status(400).json({ error: "competitor_name and summary are required" });
      return;
    }
    try {
      const brandId = await resolveBrandId();
      const note = await competitorNotes.create({
        brand_id: brandId,
        competitor_name: competitorName,
        summary,
        learning: typeof req.body?.learning === "string" ? req.body.learning.trim() || null : null,
        source_url: typeof req.body?.source_url === "string" ? req.body.source_url.trim() || null : null,
        added_by: me.name,
      });
      res.status(200).json({ ok: true, note });
    } catch (err) {
      logger.error({ err }, "competitor note create failed");
      res.status(500).json({ error: "internal error" });
    }
    return;
  }

  res.status(405).json({ error: "method not allowed" });
}
