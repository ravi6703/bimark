import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { resolveBrandId } from "../_lib/brand.js";
import { logger } from "../../src/logger.js";
import { outcomes } from "../../src/db/repositories/index.js";
import { weekStart } from "../../src/scoreboard/index.js";

/**
 * GET  /api/outcomes — recorded business results, most recent first.
 * POST /api/outcomes { period_start?, leads, signups?, source?, note?, post_id? }
 *
 * Move 1. Deliberately a hand-entry endpoint rather than a CRM integration:
 * the point is that the number exists and is attributable to a period, not
 * that it arrives automatically. `recorded_by` comes from the authenticated
 * identity, never the request body, so the provenance can't be spoofed.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const me = requireAuth(req, res);
  if (!me) return;

  if (req.method === "GET") {
    try {
      const brandId = await resolveBrandId(req);
      res.status(200).json({ ok: true, outcomes: await outcomes.list(brandId) });
    } catch (err) {
      logger.error({ err }, "outcomes list failed");
      res.status(500).json({ error: "internal error" });
    }
    return;
  }

  if (req.method === "POST") {
    const leads = Number(req.body?.leads ?? 0);
    const signups = Number(req.body?.signups ?? 0);
    if (!Number.isFinite(leads) || !Number.isFinite(signups) || leads < 0 || signups < 0) {
      res.status(400).json({ error: "leads and signups must be non-negative numbers" });
      return;
    }
    if (leads === 0 && signups === 0) {
      res.status(400).json({ error: "record at least one lead or signup" });
      return;
    }
    const source = req.body?.source;
    if (source != null && !["manual", "analytics", "crm"].includes(source)) {
      res.status(400).json({ error: "source must be manual, analytics or crm" });
      return;
    }
    try {
      const brandId = await resolveBrandId(req);
      // Default to the current week so the common case ("we got 4 leads this
      // week") needs no date picking at all.
      const period =
        typeof req.body?.period_start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.period_start)
          ? req.body.period_start
          : weekStart(new Date()).toISOString().slice(0, 10);
      const outcome = await outcomes.record({
        brand_id: brandId,
        post_id: req.body?.post_id != null ? Number(req.body.post_id) : null,
        period_start: period,
        leads,
        signups,
        source,
        note: typeof req.body?.note === "string" ? req.body.note : null,
        recorded_by: me.name,
      });
      res.status(200).json({ ok: true, outcome });
    } catch (err) {
      logger.error({ err }, "outcome record failed");
      res.status(500).json({ error: "internal error" });
    }
    return;
  }

  res.status(405).json({ error: "method not allowed" });
}
