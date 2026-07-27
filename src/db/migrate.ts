import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { closePool, getPool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "..", "db", "migrations");

/**
 * Arbitrary but stable key for the advisory lock that serializes migrate()
 * calls. Any value works as long as nothing else in the database uses it.
 */
const MIGRATION_LOCK_KEY = 4_815_162_342;

/**
 * Minimal forward-only migration runner. Applies every *.sql file in
 * db/migrations exactly once, tracked in schema_migrations.
 *
 * Runs under a Postgres advisory lock so two callers can't migrate at the same
 * time: the check ("has this file been applied?") and the apply aren't atomic
 * on their own, so concurrent runs both see a migration as pending and the
 * second one fails on an object the first already created. Real cases —
 * parallel test files each migrating in beforeAll, and two serverless
 * instances cold-starting together. The loser simply waits, then finds
 * everything applied and does nothing.
 */
export async function migrate(): Promise<string[]> {
  if (!config.db.enabled) {
    throw new Error("DATABASE_URL is not set — cannot migrate.");
  }
  const pool = getPool();
  const lock = await pool.connect();
  try {
    await lock.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    return await applyPending();
  } finally {
    await lock
      .query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY])
      .catch((err) => logger.warn({ err }, "failed to release migration lock"));
    lock.release();
  }
}

async function applyPending(): Promise<string[]> {
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
