import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { logger } from "../../src/logger.js";
import { clarifyTopic } from "../../src/agents/clarify.js";

/** POST /api/topics/clarify — §20 pre-draft check, runs before manual-intake. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const body = req.body ?? {};
  const topic = typeof body.topic === "string" ? body.topic : "";
  if (topic.trim().length < 3) {
    res.status(400).json({ error: "topic required" });
    return;
  }
  const platforms = Array.isArray(body.platforms) && body.platforms.length ? body.platforms : ["linkedin"];

  try {
    const result = await clarifyTopic({
      topic,
      platforms,
      mustSay: typeof body.must_say === "string" ? body.must_say : undefined,
      whyNow: typeof body.why_now === "string" ? body.why_now : undefined,
    });
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, "clarify failed");
    res.status(500).json({ error: "internal error" });
  }
}
