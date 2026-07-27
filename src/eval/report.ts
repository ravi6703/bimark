import { query } from "../db/pool.js";

/**
 * Move 5, part one — what the existing data already says.
 *
 * `drafts.prompt_version` has been recorded on every draft since the beginning
 * and never read. This is the read. No new tables, no regeneration, no cost: a
 * single query over drafts joined to their first human decision, grouped by the
 * prompt version that produced them.
 *
 * The honest caveat, surfaced on the screen that renders this rather than
 * buried here: these groups are observational, not a controlled experiment.
 * Prompt v1 and v2 saw different topics at different times with different
 * reviewers. A difference here is a reason to look, not proof of an
 * improvement — which is exactly what the replay harness in goldenSet.ts is
 * for, since that one holds the inputs fixed.
 */

export interface PromptVersionStats {
  promptVersion: string;
  /** Drafts generated under this version that a human has since decided on. */
  decided: number;
  /** Clean approvals, no edit needed, as a share of decisions. */
  firstPassApprovalRate: number;
  rejectRate: number;
  /** Mean characters changed when a reviewer did edit. NULL if none did. */
  meanEditDistance: number | null;
  /** Share of drafts the brand-safety reviewer flagged before a human saw them. */
  flagRate: number;
  /** Share marked as too close to something already published. */
  repetitiveRate: number;
  firstSeen: Date;
  lastSeen: Date;
}

export async function promptVersionReport(brandId: number): Promise<PromptVersionStats[]> {
  const { rows } = await query<{
    prompt_version: string;
    decided: string;
    approvals: string;
    rejects: string;
    mean_edit: string | null;
    flagged: string;
    repetitive: string;
    total: string;
    first_seen: Date;
    last_seen: Date;
  }>(
    `WITH first_decision AS (
       SELECT DISTINCT ON (a.draft_id) a.draft_id, a.action, a.edit_distance
         FROM approvals a
        WHERE a.action IN ('approve','edit','reject')
        ORDER BY a.draft_id, a.created_at ASC
     )
     SELECT COALESCE(d.prompt_version, '(unversioned)') AS prompt_version,
            count(fd.draft_id)::int                                      AS decided,
            count(*) FILTER (WHERE fd.action = 'approve')::int           AS approvals,
            count(*) FILTER (WHERE fd.action = 'reject')::int            AS rejects,
            avg(fd.edit_distance) FILTER (WHERE fd.action = 'edit')      AS mean_edit,
            count(*) FILTER (WHERE d.reviewer_result->>'verdict' = 'flag')::int AS flagged,
            count(*) FILTER (WHERE d.repetitive)::int                    AS repetitive,
            count(*)::int                                                AS total,
            min(d.created_at) AS first_seen,
            max(d.created_at) AS last_seen
       FROM drafts d
       JOIN topics t ON t.id = d.topic_id
       LEFT JOIN first_decision fd ON fd.draft_id = d.id
      WHERE t.brand_id = $1
      GROUP BY 1
      ORDER BY min(d.created_at) ASC`,
    [brandId],
  );

  return rows.map((r) => {
    const decided = Number(r.decided);
    const total = Number(r.total);
    return {
      promptVersion: r.prompt_version,
      decided,
      firstPassApprovalRate: decided > 0 ? Number(r.approvals) / decided : 0,
      rejectRate: decided > 0 ? Number(r.rejects) / decided : 0,
      meanEditDistance: r.mean_edit === null ? null : Math.round(Number(r.mean_edit)),
      flagRate: total > 0 ? Number(r.flagged) / total : 0,
      repetitiveRate: total > 0 ? Number(r.repetitive) / total : 0,
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
    };
  });
}
