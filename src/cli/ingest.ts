import { logger } from "../logger.js";
import { brands } from "../db/repositories/index.js";
import { closePool } from "../db/pool.js";
import { ingestDir } from "../rag/ingest.js";

/**
 * `npm run ingest -- <dir> [brandSlug]` — ingest .txt/.md owned material from
 * a directory (§18) into a specific brand's workspace (multi-brand support
 * follow-up — this used to always ingest into brands.first(), so there was
 * no way to load material for Leadup Universe/InfyLearn/Elearning Solutions).
 * brandSlug defaults to the first brand for back-compat.
 */
async function main() {
  const dir = process.argv[2];
  const slug = process.argv[3];
  if (!dir) throw new Error("usage: npm run ingest -- <dir> [brandSlug]");
  const b = slug ? await brands.getBySlug(slug) : await brands.first();
  if (!b) throw new Error(slug ? `no brand with slug "${slug}"` : "no brand — run \`npm run seed\`");
  const results = await ingestDir(b.id, dir);
  const stored = results.reduce((s, r) => s + r.chunks, 0);
  logger.info({ brand: b.name, files: results.length, chunks: stored }, "ingest complete");
}

main()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "ingest CLI failed");
    process.exit(1);
  });
