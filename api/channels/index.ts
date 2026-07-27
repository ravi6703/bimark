import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { resolveBrandId } from "../_lib/brand.js";
import { logger } from "../../src/logger.js";
import { channels, drafts, posts } from "../../src/db/repositories/index.js";
import { PLATFORMS, isPlatformKey } from "../../src/platforms/index.js";

const WEEK_MS = 7 * 24 * 3600 * 1000;

/**
 * GET /api/channels — one row per channel: what's waiting on a human, how the
 * week's output compares to the configured target, and lifetime published.
 *
 * The channel list comes from the platform registry, not the database, so a
 * channel the brand has never configured still shows up (with no target set)
 * rather than being invisible.
 *
 * PATCH /api/channels { platform, weekly_target?, active? } — set cadence.
 * weekly_target drives which channel the morning pitch targets (WF-1.2), so
 * it needs to be settable without editing the seed.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;

  if (req.method === "GET") {
    try {
      const brandId = await resolveBrandId(req);
      const [configs, publishedThisWeek, publishedTotal, pending] = await Promise.all([
        channels.listAll(brandId),
        posts.countPublishedSinceByPlatform(brandId, new Date(Date.now() - WEEK_MS)),
        posts.countPublishedByPlatform(brandId),
        drafts.countByPlatform(brandId, "pending_approval"),
      ]);
      const byPlatform = new Map(configs.map((c) => [c.platform, c]));

      res.status(200).json({
        ok: true,
        channels: PLATFORMS.map((def) => {
          const cfg = byPlatform.get(def.key);
          return {
            platform: def.key,
            label: def.label,
            autoPublish: def.autoPublish,
            // No config row means this brand has never set a cadence for the
            // channel — null, not 0, so the UI can say "not set" rather than
            // implying a target of zero.
            weeklyTarget: cfg?.weekly_target ?? null,
            active: cfg?.active ?? true,
            postsThisWeek: publishedThisWeek[def.key] ?? 0,
            publishedTotal: publishedTotal[def.key] ?? 0,
            pendingReview: pending[def.key] ?? 0,
          };
        }),
      });
    } catch (err) {
      logger.error({ err }, "channels list failed");
      res.status(500).json({ error: "internal error" });
    }
    return;
  }

  if (req.method === "PATCH") {
    const platform = typeof req.body?.platform === "string" ? req.body.platform : "";
    if (!isPlatformKey(platform)) {
      res.status(400).json({ error: "platform must be a known channel" });
      return;
    }
    const weeklyTarget = req.body?.weekly_target;
    if (weeklyTarget !== undefined && (!Number.isInteger(weeklyTarget) || weeklyTarget < 0)) {
      res.status(400).json({ error: "weekly_target must be a non-negative whole number" });
      return;
    }
    const active = req.body?.active;
    if (active !== undefined && typeof active !== "boolean") {
      res.status(400).json({ error: "active must be true or false" });
      return;
    }
    try {
      const brandId = await resolveBrandId(req);
      const config = await channels.upsert(brandId, platform, {
        weekly_target: weeklyTarget,
        active,
      });
      res.status(200).json({ ok: true, channel: config });
    } catch (err) {
      logger.error({ err }, "channel update failed");
      res.status(500).json({ error: "internal error" });
    }
    return;
  }

  res.status(405).json({ error: "method not allowed" });
}
