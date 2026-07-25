import type { VercelRequest, VercelResponse } from "@vercel/node";
import { config } from "../src/config.js";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    ok: true,
    db: config.db.enabled,
    llm: config.llm.live ? "live" : "mock",
    runtime: "vercel",
  });
}
