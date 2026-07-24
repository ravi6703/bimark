import { logger } from "../logger.js";
import { brands } from "../db/repositories/index.js";
import { closePool } from "../db/pool.js";
import { ingestDir } from "../rag/ingest.js";

/** `npm run ingest -- <dir>` — ingest .txt/.md owned material from a directory (§18). */
async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("usage: npm run ingest -- <dir>");
  const b = await brands.first();
  if (!b) throw new Error("no brand — run `npm run seed`");
  const results = await ingestDir(b.id, dir);
  const stored = results.reduce((s, r) => s + r.chunks, 0);
  logger.info({ files: results.length, chunks: stored }, "ingest complete");
}

main()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "ingest CLI failed");
    process.exit(1);
  });
