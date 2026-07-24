import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { closePool, getPool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "..", "db", "migrations");

/**
 * Minimal forward-only migration runner. Applies every *.sql file in
 * db/migrations exactly once, tracked in schema_migrations.
 */
export async function migrate(): Promise<string[]> {
  if (!config.db.enabled) {
    throw new Error("DATABASE_URL is not set — cannot migrate.");
  }
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied: string[] = [];
  for (const file of files) {
    const { rows } = await pool.query(
      "SELECT 1 FROM schema_migrations WHERE filename = $1",
      [file],
    );
    if (rows.length > 0) continue;

    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    logger.info({ file }, "applying migration");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        [file],
      );
      await client.query("COMMIT");
      applied.push(file);
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error({ err, file }, "migration failed");
      throw err;
    } finally {
      client.release();
    }
  }
  logger.info({ applied }, "migrations complete");
  return applied;
}

// Allow `npm run migrate`.
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, "migrate CLI failed");
      process.exit(1);
    });
}
