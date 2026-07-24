import { config } from "../config.js";
import { toVector } from "../db/repositories/index.js";
import { query } from "../db/pool.js";
import type { RetrievedChunk } from "../types.js";
import { getEmbedder } from "./embed.js";

export interface RetrieveResult {
  chunks: RetrievedChunk[];
  /** True when the best match is below the similarity threshold (§4.2 credibility guard). */
  lowSource: boolean;
  topSimilarity: number;
}

/**
 * Retrieve (§18.5): semantic top-k over owned material for a topic. Enforces a
 * similarity threshold — weak matches raise `lowSource` instead of feeding a
 * thin, invention-prone draft. The `<=>` operator is cosine distance in
 * pgvector, so similarity = 1 − distance.
 */
export async function retrieve(
  brandId: number,
  queryText: string,
  opts: { topK?: number; threshold?: number } = {},
): Promise<RetrieveResult> {
  const topK = opts.topK ?? config.rag.topK;
  const threshold = opts.threshold ?? config.rag.similarityThreshold;

  const [queryEmbedding] = await getEmbedder().embed([queryText]);
  const vec = toVector(queryEmbedding!);

  const { rows } = await query<RetrievedChunk>(
    `SELECT id, brand_id, source_type, source_ref, title, chunk_text, chunk_index,
            content_hash, pillar_hint, last_used_at, updated_at,
            1 - (embedding <=> $2::vector) AS similarity
       FROM owned_assets
      WHERE brand_id = $1 AND embedding IS NOT NULL
      ORDER BY embedding <=> $2::vector
      LIMIT $3`,
    [brandId, vec, topK],
  );

  const chunks = rows.map((r) => ({ ...r, similarity: Number(r.similarity) }));
  const topSimilarity = chunks[0]?.similarity ?? 0;
  return { chunks, lowSource: topSimilarity < threshold, topSimilarity };
}
