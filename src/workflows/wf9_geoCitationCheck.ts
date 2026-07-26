import { config } from "../config.js";
import { logger } from "../logger.js";
import { geoCitationChecks, geoProbeQueries } from "../db/repositories/index.js";
import { checkCitation } from "../geo/citationCheck.js";
import type { GeoCitationCheck } from "../types.js";

/** Only "claude" is wired up — see src/geo/citationCheck.ts for why
 * ChatGPT/Perplexity aren't (real per-query cost, a vendor call for the
 * user, not something to fake a result for). */
export const AVAILABLE_ENGINES = ["claude"] as const;
export type CitationEngine = (typeof AVAILABLE_ENGINES)[number];

/** Whether there's at least one engine actually configured to check against —
 * same honesty gate as isSovConfigured()/Brand24: no invented score when
 * nothing real is wired up. */
export function isGeoCitationConfigured(): boolean {
  return config.llm.live;
}

/**
 * WF-9 · GEO citation tracking (Okara-comparison follow-up). For each of the
 * brand's active probe questions, genuinely asks the configured engine(s)
 * and logs whether the brand's own name shows up in the real answer. A
 * brand with no probe questions yet, or no engine configured, is skipped —
 * not an error, just nothing to check.
 */
export async function runGeoCitationCheck(
  brandId: number,
  brandName: string,
): Promise<{ checked: number; results: GeoCitationCheck[] }> {
  if (!isGeoCitationConfigured()) {
    logger.info({ brandId }, "WF-9: no citation engine configured — skipping");
    return { checked: 0, results: [] };
  }

  const queries = await geoProbeQueries.listActive(brandId);
  if (queries.length === 0) {
    return { checked: 0, results: [] };
  }

  const results: GeoCitationCheck[] = [];
  for (const q of queries) {
    for (const engine of AVAILABLE_ENGINES) {
      try {
        const check = await checkCitation(q.query_text, brandName);
        const row = await geoCitationChecks.create({
          brand_id: brandId,
          probe_query_id: q.id,
          engine,
          mentioned: check.mentioned,
          response_excerpt: check.excerpt,
          model_used: check.modelUsed,
        });
        results.push(row);
      } catch (err) {
        logger.warn({ err, brandId, probeQueryId: q.id, engine }, "WF-9: citation check failed for this query");
      }
    }
  }

  logger.info({ brandId, queries: queries.length, checked: results.length }, "WF-9: citation check run");
  return { checked: results.length, results };
}
