import { z } from "zod";
import { logger } from "../logger.js";
import { pillars, topics } from "../db/repositories/index.js";
import { runRepurposeReview } from "./wf4_repurposeReview.js";
import type { Draft } from "../types.js";

/**
 * WF-3 · Manual Intake (§16, webhook). Fired when a row is saved on the shared
 * board (Airtable/Notion) or the frontend form. Human topics take priority in
 * the queue (§4.2) and run the SAME pipeline + gate as pitch picks.
 */
export const manualIntakeSchema = z.object({
  brand_id: z.number().int().positive(),
  topic: z.string().min(3), // the topic line, e.g. "the skills gap in tier-2 colleges"
  pillar: z.string().optional(), // optional pillar name
  source_asset_id: z.number().int().positive().optional(),
  platform: z.enum(["linkedin", "x", "instagram"]).optional(),
  format: z.string().optional(), // e.g. 'carousel' | 'text_pov'
  must_say: z.string().optional(),
  why_now: z.string().optional(),
});

export type ManualIntakeInput = z.infer<typeof manualIntakeSchema>;

export async function handleManualIntake(raw: unknown): Promise<{ topicId: number; draft: Draft }> {
  const input = manualIntakeSchema.parse(raw);

  let pillarId: number | null = null;
  if (input.pillar) {
    const p = await pillars.findByName(input.brand_id, input.pillar);
    pillarId = p?.id ?? null;
  }

  const topic = await topics.create({
    brand_id: input.brand_id,
    source: "manual",
    pillar_id: pillarId,
    angle: input.topic,
    why_now: input.why_now ?? "operator-seeded",
    source_asset_id: input.source_asset_id ?? null,
    platform: input.platform ?? "linkedin",
    format_hint: input.format ?? null,
    must_say: input.must_say ?? null,
    priority: 10, // outrank AI-suggested topics (§4.2)
    status: "picked",
  });

  logger.info({ topicId: topic.id, brandId: input.brand_id }, "WF-3: manual topic queued (priority)");
  const draft = await runRepurposeReview(topic.id);
  return { topicId: topic.id, draft };
}
