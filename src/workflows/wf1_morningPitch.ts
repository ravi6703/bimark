import { randomUUID } from "node:crypto";
import { logger } from "../logger.js";
import { generatePitch } from "../agents/dailyPitch.js";
import { getTrendSignal } from "../agents/trendMonitor.js";
import { campaigns, channels, ownedAssets, pillars, posts, topics } from "../db/repositories/index.js";
import { getTelegram } from "../telegram/client.js";
import { morningPitchMessage } from "../telegram/messages.js";
import type { Pillar, Topic } from "../types.js";

const WEEK_MS = 7 * 24 * 3600 * 1000;

/**
 * Which channel today's pitch is for (§16 WF-1.2) — the one furthest behind
 * its configured weekly target, so output spreads across channels according
 * to the cadence the team actually set.
 *
 * This is what WF-1.2 always claimed to do: channel_configs was read and the
 * result thrown away, and persistOption never set a platform at all, so every
 * pitch silently fell through to the `topics.platform` column default and the
 * morning pitch was LinkedIn-only in practice. weekly_target was written by
 * the seed and read by nothing.
 *
 * Falls back to LinkedIn for a brand with no active channel config — the same
 * platform it used to pick, just deliberately rather than by accident.
 */
export async function pickPitchPlatform(brandId: number): Promise<string> {
  const configs = await channels.list(brandId);
  if (configs.length === 0) return "linkedin";

  const publishedByPlatform = await posts.countPublishedSinceByPlatform(
    brandId,
    new Date(Date.now() - WEEK_MS),
  );

  let best = configs[0]!;
  let bestDeficit = -Infinity;
  for (const c of configs) {
    const deficit = (c.weekly_target ?? 0) - (publishedByPlatform[c.platform] ?? 0);
    if (deficit > bestDeficit) {
      bestDeficit = deficit;
      best = c;
    }
  }
  logger.info(
    { brandId, platform: best.platform, deficit: bestDeficit },
    "WF-1: pitching for the channel furthest behind its weekly target",
  );
  return best.platform;
}

/**
 * WF-1 · Morning Pitch (§16, scheduled). Reads pillars + candidate owned assets,
 * asks the Daily Pitch agent for exactly two options, persists both as
 * `suggested` topics, and sends the A/B/🔄/⏭ Telegram message.
 *
 * Returns the two topic rows + the pitch group so WF-2 can act on the callback.
 */
export async function runMorningPitch(brandId: number): Promise<{
  group: string;
  topicA: Topic;
  topicB: Topic;
}> {
  const activePillars = await pillars.listActive(brandId);
  if (activePillars.length === 0) throw new Error(`WF-1: brand ${brandId} has no active pillars`);

  // Respect per-platform targets/cadence (§16 WF-1.2) — see pickPitchPlatform.
  const platform = await pickPitchPlatform(brandId);

  const candidates = await ownedAssets.candidatesForPitch(brandId, 12);
  const trendSignal = await getTrendSignal(activePillars.map((p) => p.name));

  const pitch = await generatePitch({ pillars: activePillars, candidates, trendSignal });

  const group = randomUUID().slice(0, 8);
  const topicA = await persistOption(brandId, activePillars, pitch.A, group, platform);
  const topicB = await persistOption(brandId, activePillars, pitch.B, group, platform);

  const { text, buttons } = morningPitchMessage(pitch, topicA.id, topicB.id, group);
  await getTelegram().sendMessage({ text, buttons });

  logger.info({ brandId, group, topicA: topicA.id, topicB: topicB.id }, "WF-1: morning pitch sent");
  return { group, topicA, topicB };
}

/**
 * A and B are two competing ideas, so each gets its own campaign — the one
 * that loses the A/B is a real idea that was proposed and skipped, which is
 * exactly what the editorial memo reports on.
 */
async function persistOption(
  brandId: number,
  activePillars: Pillar[],
  opt: { angle: string; pillar: string; asset_id: number; why_now: string },
  group: string,
  platform: string,
): Promise<Topic> {
  const pillar = activePillars.find((p) => p.name.toLowerCase() === opt.pillar.toLowerCase());
  const sourceAssetId = opt.asset_id > 0 ? opt.asset_id : null;

  const campaign = await campaigns.create({
    brand_id: brandId,
    title: opt.angle,
    pillar_id: pillar?.id ?? null,
    source: "morning_pitch",
    why_now: opt.why_now,
    source_asset_id: sourceAssetId,
    created_by: "morning-pitch",
  });

  return topics.create({
    brand_id: brandId,
    source: "morning_pitch",
    pillar_id: pillar?.id ?? null,
    angle: opt.angle,
    why_now: opt.why_now,
    source_asset_id: sourceAssetId,
    platform,
    priority: 0,
    status: "suggested",
    pitch_group: group,
    campaign_id: campaign.id,
  });
}
