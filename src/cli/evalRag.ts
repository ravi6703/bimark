import { logger } from "../logger.js";
import { config } from "../config.js";
import { brands } from "../db/repositories/index.js";
import { closePool, query } from "../db/pool.js";
import { getEmbedder } from "../rag/embed.js";

/**
 * `npm run eval:rag` — the RAG re-tuning half of the audit's Phase 3 (§20).
 * The Tech review found `RAG_SIMILARITY_THRESHOLD` had only ever been
 * exercised against MockEmbedder's hashed bag-of-words space, which is not
 * representative of a real embedder's distribution — so the threshold's
 * behavior in dev tells you nothing about production.
 *
 * What it does: for every ingested chunk, finds its single nearest OTHER
 * chunk in the same corpus (excluding itself — trivially similarity 1.0) and
 * reports the distribution of those nearest-neighbor similarities. That's
 * the real signal a threshold should be set against: if unrelated chunks in
 * your own corpus already sit at 0.6+ similarity, a 0.35 threshold accepts
 * noise as grounding. Whichever embedder is actually configured (mock by
 * default) is whichever one this measures — it explicitly says so rather
 * than printing numbers that look calibrated but aren't.
 */
async function main() {
  const embedder = getEmbedder();
  const b = await brands.first();
  if (!b) throw new Error("no brand — run `npm run seed`");

  if (embedder.name === "mock") {
    logger.warn(
      "EMBED_PROVIDER is unset (or 'mock') — this run measures the deterministic " +
        "MockEmbedder's hashed bag-of-words space, which does NOT transfer to a real " +
        "embedder (openai/voyage). Set EMBED_PROVIDER + EMBED_API_KEY and re-run this " +
        "before trusting any threshold in production. Printing the mock-space numbers " +
        "anyway so the report format is visible.",
    );
  }

  const { rows } = await query<{ id: number }>(
    "SELECT id FROM owned_assets WHERE brand_id = $1 AND embedding IS NOT NULL",
    [b.id],
  );
  if (rows.length < 2) {
    logger.error(
      "need at least 2 ingested chunks with embeddings to measure nearest-neighbor " +
        "similarity — run `npm run ingest` first",
    );
    process.exitCode = 1;
    return;
  }

  const nearest: number[] = [];
  for (const { id } of rows) {
    const { rows: nn } = await query<{ similarity: number }>(
      `SELECT 1 - (a.embedding <=> b.embedding) AS similarity
         FROM owned_assets a, owned_assets b
        WHERE a.id = $1 AND b.brand_id = $2 AND b.id != $1 AND b.embedding IS NOT NULL
        ORDER BY a.embedding <=> b.embedding
        LIMIT 1`,
      [id, b.id],
    );
    if (nn[0]) nearest.push(Number(nn[0].similarity));
  }
  nearest.sort((x, y) => x - y);
  const pct = (p: number) => nearest[Math.floor((nearest.length - 1) * p)];

  logger.info(
    {
      provider: embedder.name,
      chunksCompared: nearest.length,
      nearestNeighborSimilarity: {
        min: nearest[0],
        p25: pct(0.25),
        median: pct(0.5),
        p75: pct(0.75),
        max: nearest[nearest.length - 1],
      },
      currentSimilarityThreshold: config.rag.similarityThreshold,
      currentDistinctivenessThreshold: config.rag.distinctivenessThreshold,
      suggestion:
        "RAG_SIMILARITY_THRESHOLD should sit comfortably above the p75 'unrelated chunk' " +
        "similarity above — if it doesn't, low_source is under-firing. " +
        "RAG_DISTINCTIVENESS_THRESHOLD (for repeated posts, not source grounding) should be " +
        "well above that again — it's meant to catch near-duplicates, not merely related content.",
    },
    "RAG eval complete — nearest-neighbor similarity distribution over ingested material",
  );
}

main()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "RAG eval CLI failed");
    process.exit(1);
  });
