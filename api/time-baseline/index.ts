import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { resolveBrandId } from "../_lib/brand.js";
import { logger } from "../../src/logger.js";
import { timeBaselines } from "../../src/db/repositories/index.js";

/**
 * GET  /api/time-baseline — the current before/after minutes-per-post estimate.
 * POST /api/time-baseline { minutes_per_post_before, minutes_per_post_after, note? }
 *
 * Move 1. Both figures are the team's own estimates and every surface that
 * renders the resulting hours-saved number says so — the platform contributes
 * only the published-post count, which it can actually measure.
 *
 * Capture the "before" figure BEFORE wider rollout. A month in, nobody can
 * recall what the old process cost, and the number becomes unrecoverable.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const me = requireAuth(req, res);
  if (!me) return;

  if (req.method === "GET") {
    try {
      const brandId = await resolveBrandId(req);
      res.status(200).json({ ok: true, baseline: await timeBaselines.current(brandId) });
    } catch (err) {
      logger.error({ err }, "time baseline read failed");
      res.status(500).json({ error: "internal error" });
    }
    return;
  }

  if (req.method === "POST") {
    const before = Number(req.body?.minutes_per_post_before);
    const after = Number(req.body?.minutes_per_post_after);
    if (!Number.isFinite(before) || before <= 0) {
      res.status(400).json({ error: "minutes_per_post_before must be a positive number" });
      return;
    }
    if (!Number.isFinite(after) || after < 0) {
      res.status(400).json({ error: "minutes_per_post_after must be zero or more" });
      return;
    }
    if (after >= before) {
      // Not a validation nicety: a non-positive saving would render as a
      // negative hours-saved figure on the scoreboard, which reads as a bug
      // rather than as the honest claim it is. Force the operator to say so.
      res.status(400).json({
        error:
          "minutes_per_post_after must be less than before — if bimark isn't saving time, " +
          "leave the baseline unset rather than recording a negative saving",
      });
      return;
    }
    try {
      const brandId = await resolveBrandId(req);
      const baseline = await timeBaselines.record({
        brand_id: brandId,
        minutes_per_post_before: Math.round(before),
        minutes_per_post_after: Math.round(after),
        note: typeof req.body?.note === "string" ? req.body.note : null,
        recorded_by: me.name,
      });
      res.status(200).json({ ok: true, baseline });
    } catch (err) {
      logger.error({ err }, "time baseline record failed");
      res.status(500).json({ error: "internal error" });
    }
    return;
  }

  res.status(405).json({ error: "method not allowed" });
}
