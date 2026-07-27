import { logger } from "../logger.js";
import { query } from "../db/pool.js";
import { brands, drafts, pillars, topics } from "../db/repositories/index.js";
import { repurpose } from "../agents/repurpose.js";
import { DEFAULT_VOICE_GUIDE, PROMPT_VERSION } from "../agents/prompts.js";
import { platformFor } from "../platforms/index.js";
import { cosine, getEmbedder } from "../rag/embed.js";
import { normalizedEditDistance } from "../metrics/editDistance.js";
import { retrieve } from "../rag/retrieve.js";
import type { EvalCase, EvalRun } from "../types.js";

/**
 * Move 5, part two — the replay harness.
 *
 * The report in report.ts observes what already happened. This holds the inputs
 * fixed and re-runs them, which is the only way to attribute a difference to a
 * prompt change rather than to a different month's topics.
 *
 * A case is a draft a human approved *with edits*: the AI's text and the text a
 * person was actually willing to publish, side by side. Nobody had to write
 * these — the team produced them by doing their job, which is why this costs a
 * few days rather than a research programme.
 *
 * Scoring is deliberately two-sided:
 *   - cosine similarity to the human's version (higher = closer to shippable)
 *   - normalized edit distance to it (lower = less rewriting needed)
 * They disagree in useful ways. A total rewrite that preserves the meaning
 * scores well on the first and badly on the second; that gap is the signal.
 */

/** Below this the edit was a typo fix, not a rewrite worth learning from. */
const MIN_EDIT_DISTANCE = 40;

/**
 * Freeze every eligible approved-with-edits draft that isn't already a case.
 * Idempotent — the unique index on source_draft_id means re-running only ever
 * adds what's new.
 */
export async function harvestCases(
  brandId: number,
  addedBy: string,
  limit = 50,
): Promise<{ added: number; skipped: number }> {
  const { rows } = await query<{
    draft_id: number;
    topic_id: number;
    platform: string;
    angle: string | null;
    ai_body: string;
    human_body: string;
    prompt_version: string | null;
    edit_distance: number;
  }>(
    `WITH first_edit AS (
       SELECT DISTINCT ON (a.draft_id) a.draft_id, a.edit_distance
         FROM approvals a
        WHERE a.action = 'edit' AND a.edit_distance IS NOT NULL
        ORDER BY a.draft_id, a.created_at ASC
     )
     SELECT d.id AS draft_id, d.topic_id, d.platform, t.angle,
            d.body AS human_body, d.ai_body, d.prompt_version, fe.edit_distance
       FROM first_edit fe
       JOIN drafts d ON d.id = fe.draft_id
       JOIN topics t ON t.id = d.topic_id
      WHERE t.brand_id = $1
        AND fe.edit_distance >= $2
        AND d.body IS NOT NULL
        AND d.ai_body IS NOT NULL
        -- Drafts edited BEFORE migration 020 had their ai_body backfilled from
        -- the already-overwritten body, so the two are identical and the case
        -- would score a meaningless perfect match. Excluded rather than
        -- quietly included as a free win.
        AND d.ai_body <> d.body
        AND NOT EXISTS (SELECT 1 FROM eval_cases ec WHERE ec.source_draft_id = d.id)
      ORDER BY fe.edit_distance DESC
      LIMIT $3`,
    [brandId, MIN_EDIT_DISTANCE, limit],
  );

  let added = 0;
  for (const r of rows) {
    const { rowCount } = await query(
      `INSERT INTO eval_cases
         (brand_id, source_draft_id, topic_id, platform, angle, ai_body, human_body,
          prompt_version, edit_distance, added_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT DO NOTHING`,
      [
        brandId,
        r.draft_id,
        r.topic_id,
        r.platform,
        r.angle,
        r.ai_body,
        r.human_body,
        r.prompt_version,
        r.edit_distance,
        addedBy,
      ],
    );
    // Count what the INSERT actually wrote. ON CONFLICT DO NOTHING makes this
    // a no-op when a concurrent harvest already inserted the row, and counting
    // the loop iteration instead would report cases that were never added.
    added += rowCount ?? 0;
  }
  logger.info({ brandId, added }, "eval: harvested golden-set cases");
  return { added, skipped: rows.length - added };
}

export async function listCases(brandId: number, limit = 100): Promise<EvalCase[]> {
  const { rows } = await query<EvalCase>(
    "SELECT * FROM eval_cases WHERE brand_id = $1 ORDER BY created_at DESC LIMIT $2",
    [brandId, limit],
  );
  return rows;
}

/**
 * Cases not yet scored under `promptVersion`.
 *
 * Without this, a batched run would re-score the same first N cases forever
 * while cheerfully reporting "run again to continue" — the caller would burn
 * generations and never reach the rest of the set. Scored case ids are read
 * back out of each run's own detail payload, so no extra bookkeeping table is
 * needed to make the batching actually progress.
 */
async function unscoredCases(brandId: number, promptVersion: string): Promise<EvalCase[]> {
  const { rows } = await query<EvalCase>(
    `SELECT c.* FROM eval_cases c
      WHERE c.brand_id = $1
        AND c.id NOT IN (
          SELECT (d->>'caseId')::int
            FROM eval_runs r
            CROSS JOIN LATERAL jsonb_array_elements(r.detail) d
           WHERE r.brand_id = $1
             AND r.prompt_version = $2
             AND jsonb_typeof(r.detail) = 'array'
             AND d->>'caseId' IS NOT NULL
        )
      ORDER BY c.created_at DESC`,
    [brandId, promptVersion],
  );
  return rows;
}

export async function listRuns(brandId: number, limit = 20): Promise<EvalRun[]> {
  const { rows } = await query<EvalRun>(
    "SELECT * FROM eval_runs WHERE brand_id = $1 ORDER BY ran_at DESC LIMIT $2",
    [brandId, limit],
  );
  return rows;
}

export interface CaseScore {
  caseId: number;
  platform: string;
  angle: string | null;
  similarity: number;
  editDistance: number;
  error?: string;
}

/**
 * Re-generate every case with today's prompts and score it against the human's
 * version.
 *
 * `maxCases` exists because each case is a real generation call: on the 60s
 * serverless budget only a handful fit in one request, so the API route passes
 * a small number and the caller runs it again to go further. Whatever is
 * skipped is reported rather than silently dropped.
 */
export async function runEval(
  brandId: number,
  ranBy: string,
  maxCases = 5,
): Promise<{ run: EvalRun; scores: CaseScore[]; remaining: number }> {
  // Only cases this prompt version hasn't seen — otherwise repeated calls
  // re-score the same batch and `remaining` never reaches zero.
  const pending = await unscoredCases(brandId, PROMPT_VERSION);
  const batch = pending.slice(0, maxCases);
  const brand = await brands.get(brandId);
  const voiceGuide = brand?.voice_guide ?? DEFAULT_VOICE_GUIDE;
  const embedder = getEmbedder();
  const scores: CaseScore[] = [];

  for (const c of batch) {
    try {
      const topic = c.topic_id != null ? await topics.get(c.topic_id) : null;
      const pillarList = await pillars.listActive(brandId);
      const pillar = pillarList.find((p) => p.id === topic?.pillar_id) ?? null;

      // Retrieval is re-run rather than frozen — the score should reflect the
      // pipeline the team actually ships, not one prompt string in isolation.
      const { chunks } = await retrieve(brandId, c.angle ?? c.human_body.slice(0, 200));

      const out = await repurpose({
        voiceGuide,
        angle: c.angle ?? "",
        pillar: pillar?.name ?? "",
        chunks,
        platform: platformFor(c.platform).key,
        pillarIntent: pillar?.intent,
        conversionTarget: pillar?.conversion_target,
      });

      // One call, both texts — the embedder batches, and scoring the pair in
      // the same request keeps them in the same model/version.
      const [a, b] = await embedder.embed([out.body, c.human_body]);
      scores.push({
        caseId: c.id,
        platform: c.platform,
        angle: c.angle,
        similarity: Math.round(cosine(a!, b!) * 1000) / 1000,
        editDistance: Math.round(normalizedEditDistance(out.body, c.human_body) * 1000) / 1000,
      });
    } catch (err) {
      // One bad case must not lose the whole run's results.
      logger.error({ err, caseId: c.id }, "eval: case failed");
      scores.push({
        caseId: c.id,
        platform: c.platform,
        angle: c.angle,
        similarity: 0,
        editDistance: 1,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const ok = scores.filter((s) => !s.error);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  const { rows } = await query<EvalRun>(
    `INSERT INTO eval_runs
       (brand_id, prompt_version, cases_run, mean_similarity, mean_edit_distance, detail, ran_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      brandId,
      PROMPT_VERSION,
      scores.length,
      mean(ok.map((s) => s.similarity)),
      mean(ok.map((s) => s.editDistance)),
      JSON.stringify(scores),
      ranBy,
    ],
  );

  return { run: rows[0]!, scores, remaining: Math.max(0, pending.length - batch.length) };
}
