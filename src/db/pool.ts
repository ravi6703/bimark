import pg from "pg";
import { config } from "../config.js";
import { logger } from "../logger.js";

/**
 * Lazily-created singleton pool. Callers should guard on `config.db.enabled`
 * before using the DB so that pure-logic paths (and CI) run without Postgres.
 */
let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!config.db.enabled) {
    throw new Error(
      "DATABASE_URL is not set — this code path requires Postgres. " +
        "Set DATABASE_URL or guard the call with config.db.enabled.",
    );
  }
  if (!pool) {
    pool = new pg.Pool({ connectionString: config.db.url, max: 10 });
    pool.on("error", (err) => logger.error({ err }, "pg pool error"));
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params as any[]);
}

/**
 * Run `fn` while holding a Postgres advisory lock, so only one caller can be
 * inside it at a time across every process sharing the database.
 *
 * For operations whose "check, then write" isn't atomic on its own and which
 * therefore break when run concurrently — migrating (two callers both see a
 * migration as pending) and seeding (two callers both see the brand as
 * missing). Real cases: parallel test files, and two serverless instances
 * cold-starting together.
 */
export async function withAdvisoryLock<T>(key: number, fn: () => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [key]);
    return await fn();
  } finally {
    await client
      .query("SELECT pg_advisory_unlock($1)", [key])
      .catch((err) => logger.warn({ err, key }, "failed to release advisory lock"));
    client.release();
  }
}

/** Run `fn` inside a transaction, rolling back on error. */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
