import { config } from "../config.js";
import { toVector } from "../db/repositories/index.js";
import { query } from "../db/pool.js";
import { getEmbedder } from "./embed.js";

export interface DistinctivenessResult {
  /** Embeds the new draft — persisted so future drafts can compare against it. */
  embedding: number[];
  repetitive: boolean;
  similarToDraftId: number | null;
  similarity: number;
}

/**
 * Distinctiveness guard (audit Phase 3, §1 "95-5 rule / distinctiveness over
 * volume") — the pipeline had a credibility guard (low_source, §4.2) for
 * "did we invent this," but nothing that asked "haven't we already said
 * this." Reuses the same embedding infrastructure already used for owned-
 * material retrieval: embed the new draft, compare against recently
 * approved/published drafts on the same platform, flag a near-duplicate
 * instead of silently shipping a repeat.
 */
export async function checkDistinctiveness(
  brandId: number,
  platform: string,
  text: string,
  excludeDraftId?: number,
): Promise<DistinctivenessResult> {
  const [embedding] = await getEmbedder().embed([text]);
  if (!embedding) {
    return { embedding: [], repetitive: false, similarToDraftId: null, similarity: 0 };
  }
  const vec = toVector(embedding);
  const since = new Date(Date.now() - config.rag.distinctivenessLookbackDays * 24 * 3600 * 1000);

  const { rows } = await query<{ id: number; similarity: number }>(
    `SELECT d.id, 1 - (d.embedding <=> $1::vector) AS similarity
       FROM drafts d
       JOIN topics t ON t.id = d.topic_id
      WHERE t.brand_id = $2 AND d.platform = $3 AND d.embedding IS NOT NULL
        AND d.status IN ('approved','edited','approved_hold')
        AND d.created_at >= $4
        AND ($5::int IS NULL OR d.id != $5)
      ORDER BY d.embedding <=> $1::vector
      LIMIT 1`,
    [vec, brandId, platform, since, excludeDraftId ?? null],
  );

  const top = rows[0];
  const similarity = top ? Number(top.similarity) : 0;
  const repetitive = top != null && similarity >= config.rag.distinctivenessThreshold;
  return { embedding, repetitive, similarToDraftId: repetitive ? top!.id : null, similarity };
}
