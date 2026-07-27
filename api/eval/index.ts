import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { resolveBrandId } from "../_lib/brand.js";
import { logger } from "../../src/logger.js";
import { promptVersionReport } from "../../src/eval/report.js";
import { listCases, listRuns } from "../../src/eval/goldenSet.js";
import { PROMPT_VERSION } from "../../src/agents/prompts.js";

/**
 * GET /api/eval — everything the prompt-quality screen needs (Move 5).
 *
 * Two different kinds of evidence, deliberately kept apart:
 *
 *  - `report` is observational. It groups real drafts by the prompt version
 *    that produced them. Cheap, always available, but confounded — different
 *    versions saw different topics with different reviewers.
 *  - `runs` are controlled. Same frozen inputs, re-run through today's prompts.
 *    Costs a generation per case, which is why it's triggered explicitly.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  try {
    const brandId = await resolveBrandId(req);
    const [report, cases, runs] = await Promise.all([
      promptVersionReport(brandId),
      listCases(brandId),
      listRuns(brandId),
    ]);
    res.status(200).json({
      ok: true,
      currentPromptVersion: PROMPT_VERSION,
      report,
      cases: cases.map((c) => ({
        id: c.id,
        platform: c.platform,
        angle: c.angle,
        prompt_version: c.prompt_version,
        edit_distance: c.edit_distance,
        added_by: c.added_by,
        created_at: c.created_at,
      })),
      runs,
    });
  } catch (err) {
    logger.error({ err }, "eval read failed");
    res.status(500).json({ error: "internal error" });
  }
}
