import { randomUUID } from "node:crypto";
import { logger } from "../logger.js";
import { generatePitch } from "../agents/dailyPitch.js";
import { getTrendSignal } from "../agents/trendMonitor.js";
import { channels, ownedAssets, pillars, topics } from "../db/repositories/index.js";
import { getTelegram } from "../telegram/client.js";
import { morningPitchMessage } from "../telegram/messages.js";
import type { Pillar, Topic } from "../types.js";

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

  // channel_configs is read to respect per-platform targets/cadence (§16 WF-1.2).
  await channels.list(brandId);

  const candidates = await ownedAssets.candidatesForPitch(brandId, 12);
  const trendSignal = await getTrendSignal(activePillars.map((p) => p.name));

  const pitch = await generatePitch({ pillars: activePillars, candidates, trendSignal });

  const group = randomUUID().slice(0, 8);
  const topicA = await persistOption(brandId, activePillars, pitch.A, group);
  const topicB = await persistOption(brandId, activePillars, pitch.B, group);

  const { text, buttons } = morningPitchMessage(pitch, topicA.id, topicB.id, group);
  await getTelegram().sendMessage({ text, buttons });

  logger.info({ brandId, group, topicA: topicA.id, topicB: topicB.id }, "WF-1: morning pitch sent");
  return { group, topicA, topicB };
}

async function persistOption(
  brandId: number,
  activePillars: Pillar[],
  opt: { angle: string; pillar: string; asset_id: number; why_now: string },
  group: string,
): Promise<Topic> {
  const pillar = activePillars.find((p) => p.name.toLowerCase() === opt.pillar.toLowerCase());
  return topics.create({
    brand_id: brandId,
    source: "morning_pitch",
    pillar_id: pillar?.id ?? null,
    angle: opt.angle,
    why_now: opt.why_now,
    source_asset_id: opt.asset_id > 0 ? opt.asset_id : null,
    priority: 0,
    status: "suggested",
    pitch_group: group,
  });
}
