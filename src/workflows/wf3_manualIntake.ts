import { z } from "zod";
import { logger } from "../logger.js";
import { pillars, topics } from "../db/repositories/index.js";
import { runRepurposeReview } from "./wf4_repurposeReview.js";
import type { Draft } from "../types.js";

/**
 * WF-3 · Manual Intake (§16, webhook). Fired when a row is saved on the shared
 * board (Airtable/Notion), the frontend form, or a direct API call. Human
 * topics take priority in the queue (§4.2) and run the SAME pipeline + gate
 * as pitch picks.
 *
 * Accepts one topic targeting multiple platforms at once: one topic + one
 * draft row is created per platform, each independently repurposed with
 * platform-appropriate copy (see agents/prompts.ts#platformSpec) and run
 * through the same brand-safety gate. `platform` (singular) is kept for
 * back-compat with earlier callers; `platforms` (plural) is preferred.
 */
const PLATFORM = z.enum(["linkedin", "x", "instagram", "geo"]);

/** Structured per-platform guidance (§20) — mirrors src/types.ts#PlatformExtra. */
const platformDetailsSchema = z.object({
  linkedin: z.object({ audience: z.string().optional(), cta: z.string().optional() }).optional(),
  x: z.object({ angleStyle: z.enum(["hot-take", "informative", "question"]).optional() }).optional(),
  instagram: z
    .object({ visualStyle: z.enum(["photography", "illustration", "infographic"]).optional() })
    .optional(),
  // GEO (audit follow-up, Okara-inspired) — the exact question this piece
  // should directly answer, since that's what an AI answer engine extracts.
  geo: z.object({ targetQuestion: z.string().optional() }).optional(),
});

export const manualIntakeSchema = z.object({
  brand_id: z.number().int().positive(),
  topic: z.string().min(3), // the topic line, e.g. "the skills gap in tier-2 colleges"
  pillar: z.string().optional(), // optional pillar name
  source_asset_id: z.number().int().positive().optional(),
  platform: PLATFORM.optional(), // back-compat: single platform
  platforms: z.array(PLATFORM).min(1).optional(), // preferred: one or more
  format: z.string().optional(), // e.g. 'carousel' | 'text_pov'
  must_say: z.string().optional(),
  why_now: z.string().optional(),
  platformDetails: platformDetailsSchema.optional(),
});

export type ManualIntakeInput = z.infer<typeof manualIntakeSchema>;

export interface ManualIntakeResult {
  platform: string;
  topicId: number;
  draft: Draft;
}

export async function handleManualIntake(raw: unknown): Promise<ManualIntakeResult[]> {
  const input = manualIntakeSchema.parse(raw);
  const targetPlatforms = input.platforms?.length ? input.platforms : [input.platform ?? "linkedin"];

  let pillarId: number | null = null;
  if (input.pillar) {
    const p = await pillars.findByName(input.brand_id, input.pillar);
    pillarId = p?.id ?? null;
  }

  const results: ManualIntakeResult[] = [];
  for (const platform of targetPlatforms) {
    const topic = await topics.create({
      brand_id: input.brand_id,
      source: "manual",
      pillar_id: pillarId,
      angle: input.topic,
      why_now: input.why_now ?? "operator-seeded",
      source_asset_id: input.source_asset_id ?? null,
      platform,
      format_hint: input.format ?? null,
      must_say: input.must_say ?? null,
      platform_extra: input.platformDetails?.[platform] ?? null,
      priority: 10, // outrank AI-suggested topics (§4.2)
      status: "picked",
    });

    logger.info(
      { topicId: topic.id, brandId: input.brand_id, platform },
      "WF-3: manual topic queued (priority)",
    );
    const draft = await runRepurposeReview(topic.id);
    results.push({ platform, topicId: topic.id, draft });
  }

  return results;
}
