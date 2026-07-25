import { logger } from "../logger.js";
import { generateMemo } from "../agents/editorialMemo.js";
import { insights, pillars, sov } from "../db/repositories/index.js";
import { query } from "../db/pool.js";
import { getTelegram } from "../telegram/client.js";

/** Competitor set (§19) — the Digital Course Production peer set. */
export const DEFAULT_COMPETITORS = ["Hurix", "MRCC", "Tesseract", "CommLab", "LetsTute"];

/**
 * A pluggable social-listening source (§19 Proxy 1). Returns a score (mentions +
 * engagement) for a query. Wire this to native LinkedIn/X search or a paid tool
 * (Brand24 / Mention). The default returns 0 — no invented numbers.
 */
export interface SovSource {
  score(query: string): Promise<number>;
}
export class NullSovSource implements SovSource {
  async score(): Promise<number> {
    return 0;
  }
}
let sovSource: SovSource = new NullSovSource();
export function setSovSource(s: SovSource): void {
  sovSource = s;
}
/**
 * Audit Phase 1: SOV was silently reporting a permanent 0% as if it were real
 * data whenever no listening source was wired up. Exposed here so the memo
 * text and the dashboard can both say "not configured" instead of a bare 0%.
 */
export function isSovConfigured(): boolean {
  return !(sovSource instanceof NullSovSource);
}

/**
 * WF-7a · SOV snapshot (§16 weekly / §19). For each pillar, score BI vs each
 * competitor on the pillar's topic keywords and store sov_pct. Trend over time
 * matters more than any single number (§11).
 */
export async function runSovSnapshot(
  brandId: number,
  brandName: string,
  competitors = DEFAULT_COMPETITORS,
): Promise<void> {
  const active = await pillars.listActive(brandId);
  for (const pillar of active) {
    const topic = `${pillar.name}`;
    const biScore = await sovSource.score(`${brandName} ${topic}`);
    const competitorScores: Record<string, number> = {};
    let competitorTotal = 0;
    for (const c of competitors) {
      const s = await sovSource.score(`${c} ${topic}`);
      competitorScores[c] = s;
      competitorTotal += s;
    }
    const denom = biScore + competitorTotal;
    const sovPct = denom > 0 ? biScore / denom : 0;
    await sov.insert({
      brand_id: brandId,
      pillar_id: pillar.id,
      bi_score: biScore,
      competitor_scores: competitorScores,
      sov_pct: sovPct,
    });
  }
  logger.info({ brandId, pillars: active.length }, "WF-7a: SOV snapshot captured");
}

/**
 * WF-7b · Editorial memo (§16 monthly / §11). Summarizes what landed, what got
 * skipped/rejected, and the SOV trend into a plain-language memo for the human.
 */
export async function runEditorialMemo(brandId: number, period: string): Promise<string> {
  const landed = await summarizeLanded(brandId, period);
  const skipped = await summarizeSkipped(brandId, period);
  const sovTrend = await summarizeSov(brandId);

  const memo = await generateMemo({ period, landed, skipped, sov: sovTrend });
  await insights.insert({ brand_id: brandId, period, memo });
  await getTelegram().sendMessage({ text: `🗒️ <b>Editorial memo — ${period}</b>\n\n${memo}` });

  logger.info({ brandId, period }, "WF-7b: editorial memo generated");
  return memo;
}

async function summarizeLanded(brandId: number, period: string): Promise<string> {
  const { rows } = await query<{ pillar: string | null; n: string }>(
    `SELECT pl.name AS pillar, count(*) AS n
       FROM posts po
       JOIN drafts d ON d.id = po.draft_id
       JOIN topics t ON t.id = d.topic_id
       LEFT JOIN pillars pl ON pl.id = t.pillar_id
      WHERE t.brand_id = $1 AND to_char(po.published_at, 'YYYY-MM') = $2
      GROUP BY pl.name`,
    [brandId, period],
  );
  if (rows.length === 0) return "no posts published this period";
  return rows.map((r) => `${r.pillar ?? "unmapped"}: ${r.n} published`).join("; ");
}

async function summarizeSkipped(brandId: number, period: string): Promise<string> {
  const { rows } = await query<{ pillar: string | null; n: string }>(
    `SELECT pl.name AS pillar, count(*) AS n
       FROM topics t
       LEFT JOIN pillars pl ON pl.id = t.pillar_id
      WHERE t.brand_id = $1 AND t.status = 'skipped'
        AND to_char(t.created_at, 'YYYY-MM') = $2
      GROUP BY pl.name`,
    [brandId, period],
  );
  if (rows.length === 0) return "nothing notably skipped";
  return rows.map((r) => `${r.pillar ?? "unmapped"}: ${r.n} skipped`).join("; ");
}

async function summarizeSov(brandId: number): Promise<string> {
  if (!isSovConfigured()) {
    return "SOV tracking not yet configured — connect a social-listening source " +
      "(see setSovSource()) to see real competitive trend data here.";
  }
  const { rows } = await query<{ sov_pct: string; captured_at: Date }>(
    `SELECT sov_pct, captured_at FROM sov_snapshots
      WHERE brand_id = $1 ORDER BY captured_at DESC LIMIT 4`,
    [brandId],
  );
  if (rows.length === 0) return "no SOV data yet";
  const pcts = rows.map((r) => `${(Number(r.sov_pct) * 100).toFixed(1)}%`).reverse();
  return `recent SOV: ${pcts.join(" → ")}`;
}
