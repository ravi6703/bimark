import { config } from "./config.js";
import { logger } from "./logger.js";
import { createServer } from "./server.js";
import { startScheduler } from "./scheduler.js";
import { closePool } from "./db/pool.js";

/** Application entrypoint: HTTP server + cron scheduler. */
async function main() {
  const app = createServer();
  const server = app.listen(config.port, () => {
    logger.info(
      {
        port: config.port,
        env: config.env,
        db: config.db.enabled ? "postgres" : "none",
        llm: config.llm.live ? "anthropic" : "mock",
        publisher: config.publish.provider,
        telegram: config.telegram.live ? "live" : "dry-run",
      },
      "Brand Visibility Engine up",
    );
  });

  const tasks = config.db.enabled ? startScheduler() : [];
  if (!config.db.enabled) {
    logger.warn("DATABASE_URL not set — scheduler disabled; HTTP + health only");
  }

  const shutdown = async (sig: string) => {
    logger.info({ sig }, "shutting down");
    for (const t of tasks) t.stop();
    server.close();
    await closePool();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "fatal startup error");
  process.exit(1);
});
