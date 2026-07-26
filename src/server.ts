import express, { type Request, type Response } from "express";
import { z } from "zod";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { approvals, brands } from "./db/repositories/index.js";
import { handleManualIntake } from "./workflows/wf3_manualIntake.js";
import { handleTelegramUpdate } from "./telegram/handleUpdate.js";

export { handleTelegramUpdate } from "./telegram/handleUpdate.js";

/**
 * HTTP surface (Docker/VM deployment): the two webhooks that drive the
 * pipeline plus health/metrics. For the Vercel deployment, the same logic runs
 * as individual functions under /api — see api/*.ts and docs/VERCEL.md.
 *   POST /webhooks/manual-intake  — WF-3 (board/frontend row saved)
 *   POST /webhooks/telegram       — WF-2 + WF-5 (button callbacks / edit command)
 *   GET  /health                  — liveness
 *   GET  /metrics/quality         — §7 first-pass approval + edit distance
 */
export function createServer() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, db: config.db.enabled, llm: config.llm.live ? "live" : "mock" });
  });

  app.get("/metrics/quality", async (_req, res) => {
    if (!config.db.enabled) return res.status(503).json({ error: "DB not configured" });
    // This Docker/VM server predates multi-brand support and has no brand
    // switcher of its own (see api/*.ts for the Vercel deployment, which
    // does) — reports against whichever brand was seeded first.
    const brand = await brands.first();
    if (!brand) return res.status(404).json({ error: "no brand configured" });
    const stats = await approvals.qualityStats(brand.id);
    res.json({ ...stats, target: config.quality.firstPassApprovalTarget });
  });

  // WF-3 · Manual Intake
  app.post("/webhooks/manual-intake", async (req: Request, res: Response) => {
    try {
      const results = await handleManualIntake(req.body);
      res.json({
        ok: true,
        results: results.map((r) => ({ platform: r.platform, topicId: r.topicId, draftId: r.draft.id })),
      });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
      logger.error({ err }, "manual-intake failed");
      res.status(500).json({ error: "internal error" });
    }
  });

  // WF-2 + WF-5 · Telegram callbacks & edit command
  app.post("/webhooks/telegram", async (req: Request, res: Response) => {
    // Ack immediately; Telegram retries on non-2xx.
    res.json({ ok: true });
    try {
      await handleTelegramUpdate(req.body);
    } catch (err) {
      logger.error({ err }, "telegram update handling failed");
    }
  });

  return app;
}
