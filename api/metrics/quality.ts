import type { VercelRequest, VercelResponse } from "@vercel/node";
import { config } from "../../src/config.js";
import { approvals } from "../../src/db/repositories/index.js";

/** §7 operational metric: first-pass approval rate + mean edit distance. */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  if (!config.db.enabled) {
    res.status(503).json({ error: "DATABASE_URL not configured" });
    return;
  }
  const stats = await approvals.qualityStats();
  res.status(200).json({ ...stats, target: config.quality.firstPassApprovalTarget });
}
