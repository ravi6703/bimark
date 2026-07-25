import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { resolveBrandId } from "../_lib/brand.js";
import { logger } from "../../src/logger.js";
import { posts } from "../../src/db/repositories/index.js";

const DAY_MS = 24 * 3600 * 1000;

/**
 * GET /api/posts?from=&to= — scheduled + published posts for the calendar
 * view (audit Phase 2). `from`/`to` are ISO dates; defaults to a 6-week
 * window (1 week back, 5 weeks forward) so a month grid has no empty edges.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  try {
    const brandId = await resolveBrandId();
    const now = new Date();
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : new Date(now.getTime() - 7 * DAY_MS);
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : new Date(now.getTime() + 35 * DAY_MS);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      res.status(400).json({ error: "invalid from/to" });
      return;
    }
    const rows = await posts.listWithContext(brandId, { from, to });
    res.status(200).json({ ok: true, posts: rows });
  } catch (err) {
    logger.error({ err }, "posts list failed");
    res.status(500).json({ error: "internal error" });
  }
}
