import type {
  ApprovalEntry,
  Brand,
  ChannelConfig,
  CompetitorNote,
  Draft,
  DraftStatus,
  DraftWithContext,
  GeoCitationCheck,
  GeoProbeQuery,
  MediaAsset,
  OwnedAsset,
  Pillar,
  Post,
  PostWithContext,
  RedditOpportunity,
  RedditSearchTerm,
  ReviewerResult,
  SeoAudit,
  SeoCheck,
  Topic,
  TopicStatus,
  User,
} from "../../types.js";
import { query, withTransaction } from "../pool.js";

/**
 * Thin typed data-access layer. One namespace per table; workflows compose these
 * rather than writing SQL inline, which keeps the §16 workflow code readable.
 */

// ── Brands ──────────────────────────────────────────────────────────────────
export const brands = {
  async get(id: number): Promise<Brand | null> {
    const { rows } = await query<Brand>("SELECT * FROM brands WHERE id = $1", [id]);
    return rows[0] ?? null;
  },
  async getByName(name: string): Promise<Brand | null> {
    const { rows } = await query<Brand>("SELECT * FROM brands WHERE name = $1", [name]);
    return rows[0] ?? null;
  },
  async getBySlug(slug: string): Promise<Brand | null> {
    const { rows } = await query<Brand>("SELECT * FROM brands WHERE slug = $1", [slug]);
    return rows[0] ?? null;
  },
  /** Back-compat default when no brand is specified in the request (multi-brand support). */
  async first(): Promise<Brand | null> {
    const { rows } = await query<Brand>("SELECT * FROM brands ORDER BY id LIMIT 1");
    return rows[0] ?? null;
  },
  /** Every brand workspace — for the dashboard's brand switcher and the cron jobs
   * that now run per-brand instead of assuming there's only one (multi-brand support). */
  async listAll(): Promise<Brand[]> {
    const { rows } = await query<Brand>("SELECT * FROM brands ORDER BY id");
    return rows;
  },
  async create(b: {
    name: string;
    slug: string;
    voice_guide?: string;
    visual_notes?: string;
    banned_topics?: string[];
    default_competitors?: string[];
  }): Promise<Brand> {
    const { rows } = await query<Brand>(
      `INSERT INTO brands (name, slug, voice_guide, visual_notes, banned_topics, default_competitors)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        b.name,
        b.slug,
        b.voice_guide ?? null,
        b.visual_notes ?? null,
        b.banned_topics ?? null,
        b.default_competitors ?? null,
      ],
    );
    return rows[0]!;
  },
  async update(
    id: number,
    b: {
      voice_guide?: string;
      visual_notes?: string;
      banned_topics?: string[];
      ayrshare_api_key?: string;
      ayrshare_profile_key?: string;
      site_url?: string;
    },
  ): Promise<Brand | null> {
    const { rows } = await query<Brand>(
      `UPDATE brands SET
         voice_guide = COALESCE($2, voice_guide),
         visual_notes = COALESCE($3, visual_notes),
         banned_topics = COALESCE($4, banned_topics),
         ayrshare_api_key = COALESCE($5, ayrshare_api_key),
         ayrshare_profile_key = COALESCE($6, ayrshare_profile_key),
         site_url = COALESCE($7, site_url)
       WHERE id = $1 RETURNING *`,
      [
        id,
        b.voice_guide ?? null,
        b.visual_notes ?? null,
        b.banned_topics ?? null,
        b.ayrshare_api_key ?? null,
        b.ayrshare_profile_key ?? null,
        b.site_url ?? null,
      ],
    );
    return rows[0] ?? null;
  },
  /** Brand logo upload (LinkedIn multi-image follow-up) — self-hosted the
   * same way generated media is. Separate from update() since it's binary
   * and always an explicit replace-or-clear, not a partial-field PATCH. */
  async setLogo(id: number, mimeType: string, data: Buffer): Promise<Brand | null> {
    const { rows } = await query<Brand>(
      "UPDATE brands SET logo_mime_type = $2, logo_data = $3 WHERE id = $1 RETURNING *",
      [id, mimeType, data],
    );
    return rows[0] ?? null;
  },
  async clearLogo(id: number): Promise<Brand | null> {
    const { rows } = await query<Brand>(
      "UPDATE brands SET logo_mime_type = NULL, logo_data = NULL WHERE id = $1 RETURNING *",
      [id],
    );
    return rows[0] ?? null;
  },
};

// ── Pillars ─────────────────────────────────────────────────────────────────
export const pillars = {
  async listActive(brandId: number): Promise<Pillar[]> {
    const { rows } = await query<Pillar>(
      "SELECT * FROM pillars WHERE brand_id = $1 AND active = true ORDER BY id",
      [brandId],
    );
    return rows;
  },
  /** Includes inactive pillars — for the management UI, not the pitch/manual-intake pickers. */
  async listAll(brandId: number): Promise<Pillar[]> {
    const { rows } = await query<Pillar>("SELECT * FROM pillars WHERE brand_id = $1 ORDER BY id", [
      brandId,
    ]);
    return rows;
  },
  async update(
    id: number,
    p: { name?: string; description?: string | null; active?: boolean },
  ): Promise<Pillar | null> {
    const { rows } = await query<Pillar>(
      `UPDATE pillars SET
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         active = COALESCE($4, active)
       WHERE id = $1 RETURNING *`,
      [id, p.name ?? null, p.description ?? null, p.active ?? null],
    );
    return rows[0] ?? null;
  },
  async create(p: {
    brand_id: number;
    name: string;
    description?: string;
  }): Promise<Pillar> {
    const { rows } = await query<Pillar>(
      `INSERT INTO pillars (brand_id, name, description) VALUES ($1,$2,$3) RETURNING *`,
      [p.brand_id, p.name, p.description ?? null],
    );
    return rows[0]!;
  },
  async findByName(brandId: number, name: string): Promise<Pillar | null> {
    const { rows } = await query<Pillar>(
      "SELECT * FROM pillars WHERE brand_id = $1 AND lower(name) = lower($2) LIMIT 1",
      [brandId, name],
    );
    return rows[0] ?? null;
  },
};

// ── Channel configs ───────────────────────────────────────────────────────────
export const channels = {
  async list(brandId: number): Promise<ChannelConfig[]> {
    const { rows } = await query<ChannelConfig>(
      "SELECT * FROM channel_configs WHERE brand_id = $1 AND active = true",
      [brandId],
    );
    return rows;
  },
  async create(c: {
    brand_id: number;
    platform: string;
    weekly_target: number;
    allowed_media: string[];
    monthly_budget_usd?: number;
  }): Promise<ChannelConfig> {
    const { rows } = await query<ChannelConfig>(
      `INSERT INTO channel_configs (brand_id, platform, weekly_target, allowed_media, monthly_budget_usd)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [c.brand_id, c.platform, c.weekly_target, c.allowed_media, c.monthly_budget_usd ?? null],
    );
    return rows[0]!;
  },
};

// ── Owned assets (RAG store) ──────────────────────────────────────────────────
export const ownedAssets = {
  async get(id: number): Promise<OwnedAsset | null> {
    const { rows } = await query<OwnedAsset>(
      "SELECT id, brand_id, source_type, source_ref, title, chunk_text, chunk_index, content_hash, pillar_hint, last_used_at, updated_at FROM owned_assets WHERE id = $1",
      [id],
    );
    return rows[0] ?? null;
  },

  async hashesForSource(brandId: number, sourceRef: string): Promise<Set<string>> {
    const { rows } = await query<{ content_hash: string }>(
      "SELECT DISTINCT content_hash FROM owned_assets WHERE brand_id = $1 AND source_ref = $2 AND content_hash IS NOT NULL",
      [brandId, sourceRef],
    );
    return new Set(rows.map((r) => r.content_hash));
  },

  /** Replace all chunks for a source file with a fresh set (used on re-ingest). */
  async replaceSource(
    brandId: number,
    sourceRef: string,
    chunks: {
      source_type: string;
      title: string;
      chunk_text: string;
      chunk_index: number;
      content_hash: string;
      embedding: number[];
      pillar_hint: number | null;
    }[],
  ): Promise<number> {
    return withTransaction(async (client) => {
      await client.query(
        "DELETE FROM owned_assets WHERE brand_id = $1 AND source_ref = $2",
        [brandId, sourceRef],
      );
      for (const c of chunks) {
        await client.query(
          `INSERT INTO owned_assets
             (brand_id, source_type, source_ref, title, chunk_text, chunk_index, content_hash, embedding, pillar_hint)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            brandId,
            c.source_type,
            sourceRef,
            c.title,
            c.chunk_text,
            c.chunk_index,
            c.content_hash,
            toVector(c.embedding),
            c.pillar_hint,
          ],
        );
      }
      return chunks.length;
    });
  },

  /**
   * A spread of candidates for the morning pitch: prefer chunks not used
   * recently, with at most a few per pillar so the two options can differ (WF-1.3).
   */
  async candidatesForPitch(brandId: number, limit = 12): Promise<OwnedAsset[]> {
    const { rows } = await query<OwnedAsset>(
      `SELECT DISTINCT ON (pillar_hint, title) id, brand_id, source_type, source_ref,
              title, chunk_text, chunk_index, content_hash, pillar_hint, last_used_at, updated_at
         FROM owned_assets
        WHERE brand_id = $1
        ORDER BY pillar_hint, title, last_used_at NULLS FIRST, updated_at DESC
        LIMIT $2`,
      [brandId, limit],
    );
    return rows;
  },

  async markUsed(id: number): Promise<void> {
    await query("UPDATE owned_assets SET last_used_at = now() WHERE id = $1", [id]);
  },
};

/** pgvector accepts a bracketed string literal, e.g. "[0.1,0.2,...]". */
export function toVector(v: number[]): string {
  return `[${v.join(",")}]`;
}

// ── Topics ────────────────────────────────────────────────────────────────────
export const topics = {
  async get(id: number): Promise<Topic | null> {
    const { rows } = await query<Topic>("SELECT * FROM topics WHERE id = $1", [id]);
    return rows[0] ?? null;
  },
  async create(t: {
    brand_id: number;
    source: string;
    pillar_id?: number | null;
    angle?: string;
    why_now?: string;
    source_asset_id?: number | null;
    platform?: string;
    format_hint?: string | null;
    must_say?: string | null;
    platform_extra?: Topic["platform_extra"];
    priority?: number;
    status?: TopicStatus;
    pitch_group?: string | null;
  }): Promise<Topic> {
    const { rows } = await query<Topic>(
      `INSERT INTO topics
         (brand_id, source, pillar_id, angle, why_now, source_asset_id, platform,
          format_hint, must_say, platform_extra, priority, status, pitch_group)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        t.brand_id,
        t.source,
        t.pillar_id ?? null,
        t.angle ?? null,
        t.why_now ?? null,
        t.source_asset_id ?? null,
        t.platform ?? "linkedin",
        t.format_hint ?? null,
        t.must_say ?? null,
        t.platform_extra ? JSON.stringify(t.platform_extra) : null,
        t.priority ?? 0,
        t.status ?? "suggested",
        t.pitch_group ?? null,
      ],
    );
    return rows[0]!;
  },
  async setStatus(id: number, status: TopicStatus): Promise<void> {
    await query("UPDATE topics SET status = $2 WHERE id = $1", [id, status]);
  },
  async setStatusForGroup(pitchGroup: string, status: TopicStatus): Promise<void> {
    await query("UPDATE topics SET status = $2 WHERE pitch_group = $1", [pitchGroup, status]);
  },
  /**
   * Atomically move a topic picked -> drafting, returning the row only if THIS
   * caller won the transition. Async intake means the same topic can now be
   * generated from two places at once (the browser firing per-platform
   * generates, and the drain cron sweeping up anything the browser dropped),
   * so the claim has to be the DB's decision, not a read-then-write race —
   * same concurrency posture as finalizeDraft. Returns null when someone else
   * already claimed it (or it isn't in `picked`).
   */
  async claimForDrafting(id: number): Promise<Topic | null> {
    const { rows } = await query<Topic>(
      "UPDATE topics SET status = 'drafting' WHERE id = $1 AND status = 'picked' RETURNING *",
      [id],
    );
    return rows[0] ?? null;
  },
  /**
   * Topics queued for generation that nobody ever picked up — the drain cron's
   * work list (WF-3 async intake). A topic goes picked -> drafting the instant
   * generation starts, so anything still `picked` after `minAgeMinutes` was
   * dropped (browser tab closed mid-generate, network failure, function
   * eviction) and needs sweeping up.
   */
  async listPendingGeneration(minAgeMinutes = 5, limit = 10): Promise<Topic[]> {
    const { rows } = await query<Topic>(
      `SELECT * FROM topics
        WHERE status = 'picked'
          AND created_at < now() - ($1 || ' minutes')::interval
        ORDER BY priority DESC, created_at ASC
        LIMIT $2`,
      [minAgeMinutes, limit],
    );
    return rows;
  },
  /** Highest-priority queued topic — manual topics outrank pitch picks (§4.2). */
  async nextQueued(brandId: number): Promise<Topic | null> {
    const { rows } = await query<Topic>(
      `SELECT * FROM topics
        WHERE brand_id = $1 AND status = 'picked'
        ORDER BY priority DESC, created_at ASC LIMIT 1`,
      [brandId],
    );
    return rows[0] ?? null;
  },
  /** For the dashboard's topic list. */
  async list(brandId: number, opts: { status?: TopicStatus; limit?: number } = {}): Promise<Topic[]> {
    const limit = opts.limit ?? 50;
    if (opts.status) {
      const { rows } = await query<Topic>(
        `SELECT * FROM topics WHERE brand_id = $1 AND status = $2
          ORDER BY priority DESC, created_at DESC LIMIT $3`,
        [brandId, opts.status, limit],
      );
      return rows;
    }
    const { rows } = await query<Topic>(
      `SELECT * FROM topics WHERE brand_id = $1
        ORDER BY priority DESC, created_at DESC LIMIT $2`,
      [brandId, limit],
    );
    return rows;
  },
};

// ── Drafts ────────────────────────────────────────────────────────────────────
export const drafts = {
  async get(id: number): Promise<Draft | null> {
    const { rows } = await query<Draft>("SELECT * FROM drafts WHERE id = $1", [id]);
    return rows[0] ?? null;
  },
  async create(d: {
    topic_id: number;
    platform: string;
    body: string;
    variants: string[];
    claims_used: string[];
    low_source: boolean;
    model_used: string;
    prompt_version: string;
    reviewer_result: ReviewerResult | null;
    review_retries: number;
    status: DraftStatus;
  }): Promise<Draft> {
    const { rows } = await query<Draft>(
      `INSERT INTO drafts
         (topic_id, platform, body, variants, claims_used, low_source, model_used,
          prompt_version, reviewer_result, review_retries, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        d.topic_id,
        d.platform,
        d.body,
        JSON.stringify(d.variants),
        JSON.stringify(d.claims_used),
        d.low_source,
        d.model_used,
        d.prompt_version,
        d.reviewer_result ? JSON.stringify(d.reviewer_result) : null,
        d.review_retries,
        d.status,
      ],
    );
    return rows[0]!;
  },
  async setStatus(id: number, status: DraftStatus): Promise<void> {
    await query("UPDATE drafts SET status = $2 WHERE id = $1", [id, status]);
  },
  async setBody(id: number, body: string, status: DraftStatus): Promise<void> {
    await query("UPDATE drafts SET body = $2, status = $3 WHERE id = $1", [id, body, status]);
  },
  async setMediaAsset(id: number, mediaAssetId: number): Promise<void> {
    await query("UPDATE drafts SET media_asset_id = $2 WHERE id = $1", [id, mediaAssetId]);
  },
  /** Distinctiveness guard (audit Phase 3) — persists the embedding for future comparisons. */
  async setDistinctiveness(
    id: number,
    d: { embedding: number[]; repetitive: boolean; similarToDraftId: number | null },
  ): Promise<void> {
    await query(
      `UPDATE drafts SET embedding = $2::vector, repetitive = $3, similar_to_draft_id = $4 WHERE id = $1`,
      [id, toVector(d.embedding), d.repetitive, d.similarToDraftId],
    );
  },
  /**
   * Atomic status transition (audit Phase 0 concurrency guard) — the only
   * safe way to move a draft out of a given status. Two simultaneous actions
   * on the same draft (Telegram racing the dashboard, or two teammates both
   * clicking Approve) can't both succeed: whichever loses the race gets null
   * back instead of a second publish. Compares status as text so the enum
   * type never needs an array cast on the driver side.
   */
  async claim(id: number, fromStatuses: DraftStatus[], toStatus: DraftStatus): Promise<Draft | null> {
    const { rows } = await query<Draft>(
      `UPDATE drafts SET status = $2 WHERE id = $1 AND status::text = ANY($3::text[]) RETURNING *`,
      [id, toStatus, fromStatuses],
    );
    return rows[0] ?? null;
  },
  /**
   * Recent angles already covered for this pillar+platform (Okara-inspired
   * follow-up, "show previous data") — fed into the generation prompt so a
   * new draft doesn't blindly repeat what's already been said, and surfaced
   * to the operator before they submit a new topic.
   */
  async listRecentAngles(
    brandId: number,
    platform: string,
    pillarId: number | null,
    limit = 5,
  ): Promise<{ angle: string; created_at: Date; status: DraftStatus }[]> {
    const pillarClause = pillarId != null ? "AND t.pillar_id = $3" : "AND t.pillar_id IS NULL";
    const params = pillarId != null ? [brandId, platform, pillarId, limit] : [brandId, platform, limit];
    const { rows } = await query<{ angle: string; created_at: Date; status: DraftStatus }>(
      `SELECT t.angle, d.created_at, d.status
         FROM drafts d
         JOIN topics t ON t.id = d.topic_id
        WHERE t.brand_id = $1 AND d.platform = $2 ${pillarClause}
          AND d.status IN ('approved','edited','approved_hold','pending_approval')
          AND t.angle IS NOT NULL
        ORDER BY d.created_at DESC
        LIMIT $${pillarId != null ? 4 : 3}`,
      params,
    );
    return rows;
  },
  /** For the dashboard's review queue — joins the topic's angle/pillar for context. */
  async listWithContext(
    brandId: number,
    opts: { status?: DraftStatus; limit?: number } = {},
  ): Promise<DraftWithContext[]> {
    const limit = opts.limit ?? 50;
    const statusClause = opts.status ? "AND d.status = $2" : "";
    const params: unknown[] = opts.status ? [brandId, opts.status, limit] : [brandId, limit];
    const { rows } = await query<DraftWithContext>(
      `SELECT d.*, t.angle AS topic_angle, t.brand_id AS brand_id, pl.name AS pillar_name,
              t.why_now AS topic_why_now, t.source AS topic_source,
              t.format_hint AS topic_format_hint, t.platform_extra AS topic_platform_extra,
              COALESCE(
                (SELECT array_agg(a.id ORDER BY a.id) FROM assets a WHERE a.draft_id = d.id),
                '{}'
              ) AS media_asset_ids
         FROM drafts d
         JOIN topics t ON t.id = d.topic_id
         LEFT JOIN pillars pl ON pl.id = t.pillar_id
        WHERE t.brand_id = $1 ${statusClause}
        ORDER BY d.created_at DESC LIMIT $${opts.status ? 3 : 2}`,
      params,
    );
    return rows;
  },
};

// ── Generated media (§20 image generation) ────────────────────────────────────
export const mediaAssets = {
  /** Self-hosted — bytes live in Postgres, served by api/media/[id].ts. */
  async create(a: {
    draft_id: number;
    type: "image" | "video";
    mime_type: string;
    data: Buffer;
    model_used: string;
  }): Promise<MediaAsset> {
    const { rows } = await query<MediaAsset>(
      `INSERT INTO assets (draft_id, type, mime_type, data, model_used)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, draft_id, type, mime_type, data, model_used`,
      [a.draft_id, a.type, a.mime_type, a.data, a.model_used],
    );
    return rows[0]!;
  },
  async get(id: number): Promise<MediaAsset | null> {
    const { rows } = await query<MediaAsset>(
      "SELECT id, draft_id, type, mime_type, data, model_used FROM assets WHERE id = $1",
      [id],
    );
    return rows[0] ?? null;
  },
  /** Every image generated for a draft, in creation order (LinkedIn
   * multi-image follow-up) — a draft can now carry more than one. */
  async listForDraft(draftId: number): Promise<MediaAsset[]> {
    const { rows } = await query<MediaAsset>(
      "SELECT id, draft_id, type, mime_type, data, model_used FROM assets WHERE draft_id = $1 ORDER BY id",
      [draftId],
    );
    return rows;
  },
  /** Clears a draft's existing images before regenerating a fresh set. */
  async deleteForDraft(draftId: number): Promise<void> {
    await query("DELETE FROM assets WHERE draft_id = $1", [draftId]);
  },
};

// ── Approvals ──────────────────────────────────────────────────────────────────
export const approvals = {
  async log(a: {
    draft_id: number;
    approver: string;
    action: "approve" | "edit" | "reject" | "publish";
    reason?: string;
    edit_distance?: number;
  }): Promise<void> {
    await query(
      `INSERT INTO approvals (draft_id, approver, action, reason, edit_distance)
       VALUES ($1,$2,$3,$4,$5)`,
      [a.draft_id, a.approver, a.action, a.reason ?? null, a.edit_distance ?? null],
    );
  },
  /** First-pass approval rate + mean edit distance (§7 operational metric). */
  async qualityStats(brandId: number): Promise<{
    firstPassApprovalRate: number | null;
    meanEditDistance: number | null;
    sample: number;
  }> {
    const { rows } = await query<{
      approvals: string;
      edits: string;
      rejects: string;
      mean_edit: string | null;
    }>(
      `SELECT
         count(*) FILTER (WHERE a.action = 'approve') AS approvals,
         count(*) FILTER (WHERE a.action = 'edit')    AS edits,
         count(*) FILTER (WHERE a.action = 'reject')  AS rejects,
         avg(a.edit_distance) FILTER (WHERE a.action IN ('approve','edit')) AS mean_edit
       FROM approvals a
       JOIN drafts d ON d.id = a.draft_id
       JOIN topics t ON t.id = d.topic_id
      WHERE t.brand_id = $1`,
      [brandId],
    );
    const r = rows[0]!;
    const approvalsN = Number(r.approvals);
    const editsN = Number(r.edits);
    const rejectsN = Number(r.rejects);
    const sample = approvalsN + editsN + rejectsN;
    return {
      firstPassApprovalRate: sample > 0 ? approvalsN / sample : null,
      meanEditDistance: r.mean_edit === null ? null : Number(r.mean_edit),
      sample,
    };
  },
  /** A draft's audit trail (audit Phase 2) — makes Phase 0's real approver identity visible. */
  async listForDraft(draftId: number): Promise<ApprovalEntry[]> {
    const { rows } = await query<ApprovalEntry>(
      `SELECT id, approver, action, reason, edit_distance, created_at
         FROM approvals WHERE draft_id = $1 ORDER BY created_at ASC`,
      [draftId],
    );
    return rows;
  },
};

// ── Posts ──────────────────────────────────────────────────────────────────────
export const posts = {
  async create(p: {
    draft_id: number;
    platform: string;
    external_id: string | null;
    url: string | null;
    scheduled_at: Date | null;
    published_at: Date | null;
    poll_until: Date | null;
  }): Promise<Post> {
    const { rows } = await query<Post>(
      `INSERT INTO posts (draft_id, platform, external_id, url, scheduled_at, published_at, poll_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        p.draft_id,
        p.platform,
        p.external_id,
        p.url,
        p.scheduled_at,
        p.published_at,
        p.poll_until,
      ],
    );
    return rows[0]!;
  },
  /** Includes the owning brand's id (multi-brand support follow-up) — the
   * poller needs it to fetch metrics through that brand's own publish
   * credentials rather than always the shared default. */
  async withinPollingWindow(now: Date): Promise<(Post & { brand_id: number })[]> {
    const { rows } = await query<Post & { brand_id: number }>(
      `SELECT po.*, t.brand_id
         FROM posts po
         JOIN drafts d ON d.id = po.draft_id
         JOIN topics t ON t.id = d.topic_id
        WHERE po.poll_until IS NOT NULL AND po.poll_until > $1`,
      [now],
    );
    return rows;
  },
  /** Cadence rollup (audit Phase 1) — how many posts actually went out since `since`. */
  async countPublishedSince(brandId: number, since: Date): Promise<number> {
    const { rows } = await query<{ n: string }>(
      `SELECT count(*)::int AS n
         FROM posts po
         JOIN drafts d ON d.id = po.draft_id
         JOIN topics t ON t.id = d.topic_id
        WHERE t.brand_id = $1 AND po.published_at >= $2`,
      [brandId, since],
    );
    return Number(rows[0]?.n ?? 0);
  },
  /** Calendar view (audit Phase 2) — scheduled + published posts, joined for display. */
  async listWithContext(
    brandId: number,
    opts: { from: Date; to: Date },
  ): Promise<PostWithContext[]> {
    const { rows } = await query<PostWithContext>(
      `SELECT po.*, d.body, d.media_asset_id, pl.name AS pillar_name
         FROM posts po
         JOIN drafts d ON d.id = po.draft_id
         JOIN topics t ON t.id = d.topic_id
         LEFT JOIN pillars pl ON pl.id = t.pillar_id
        WHERE t.brand_id = $1
          AND coalesce(po.scheduled_at, po.published_at) >= $2
          AND coalesce(po.scheduled_at, po.published_at) < $3
        ORDER BY coalesce(po.scheduled_at, po.published_at) ASC`,
      [brandId, opts.from, opts.to],
    );
    return rows;
  },
};

// ── Metrics ────────────────────────────────────────────────────────────────────
export const metrics = {
  async insert(m: {
    post_id: number;
    impressions: number;
    engagements: number;
    clicks: number;
    saves: number;
    shares: number;
    comments: number;
  }): Promise<void> {
    await query(
      `INSERT INTO metrics (post_id, impressions, engagements, clicks, saves, shares, comments)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [m.post_id, m.impressions, m.engagements, m.clicks, m.saves, m.shares, m.comments],
    );
  },
};

// ── SOV snapshots ───────────────────────────────────────────────────────────────
export const sov = {
  async insert(s: {
    brand_id: number;
    pillar_id: number | null;
    bi_score: number;
    competitor_scores: Record<string, number>;
    sov_pct: number;
  }): Promise<void> {
    await query(
      `INSERT INTO sov_snapshots (brand_id, pillar_id, bi_score, competitor_scores, sov_pct)
       VALUES ($1,$2,$3,$4,$5)`,
      [s.brand_id, s.pillar_id, s.bi_score, JSON.stringify(s.competitor_scores), s.sov_pct],
    );
  },
  /**
   * Most recent snapshot's per-competitor scores (competitor dashboard,
   * Okara-inspired follow-up) — real numbers from whichever SOV source is
   * configured, aggregated across pillars, not invented. Returns null when
   * there's no snapshot yet (isSovConfigured() upstream already covers "not
   * configured at all").
   */
  async latestCompetitorScores(
    brandId: number,
  ): Promise<{ capturedAt: Date; scores: Record<string, number> } | null> {
    const { rows } = await query<{ captured_at: Date; competitor_scores: Record<string, number> }>(
      `SELECT captured_at, competitor_scores FROM sov_snapshots
        WHERE brand_id = $1 ORDER BY captured_at DESC LIMIT 1`,
      [brandId],
    );
    const latest = rows[0];
    if (!latest) return null;
    return { capturedAt: latest.captured_at, scores: latest.competitor_scores };
  },
};

// ── Competitor intelligence log (Okara-inspired follow-up) ─────────────────
export const competitorNotes = {
  async list(brandId: number, limit = 200): Promise<CompetitorNote[]> {
    const { rows } = await query<CompetitorNote>(
      `SELECT * FROM competitor_notes WHERE brand_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [brandId, limit],
    );
    return rows;
  },
  async create(n: {
    brand_id: number;
    competitor_name: string;
    source_url?: string | null;
    summary: string;
    learning?: string | null;
    added_by: string;
  }): Promise<CompetitorNote> {
    const { rows } = await query<CompetitorNote>(
      `INSERT INTO competitor_notes (brand_id, competitor_name, source_url, summary, learning, added_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [n.brand_id, n.competitor_name, n.source_url ?? null, n.summary, n.learning ?? null, n.added_by],
    );
    return rows[0]!;
  },
  async delete(id: number, brandId: number): Promise<boolean> {
    const { rowCount } = await query(
      "DELETE FROM competitor_notes WHERE id = $1 AND brand_id = $2",
      [id, brandId],
    );
    return (rowCount ?? 0) > 0;
  },
};

// ── GEO citation tracking (closes the loop on the GEO content platform —
// checks whether the brand actually gets cited, instead of only writing for
// AI answer engines and hoping) ────────────────────────────────────────────
export const geoProbeQueries = {
  async list(brandId: number): Promise<GeoProbeQuery[]> {
    const { rows } = await query<GeoProbeQuery>(
      "SELECT * FROM geo_probe_queries WHERE brand_id = $1 ORDER BY created_at DESC",
      [brandId],
    );
    return rows;
  },
  async listActive(brandId: number): Promise<GeoProbeQuery[]> {
    const { rows } = await query<GeoProbeQuery>(
      "SELECT * FROM geo_probe_queries WHERE brand_id = $1 AND active = true ORDER BY created_at DESC",
      [brandId],
    );
    return rows;
  },
  async create(q: { brand_id: number; query_text: string }): Promise<GeoProbeQuery> {
    const { rows } = await query<GeoProbeQuery>(
      "INSERT INTO geo_probe_queries (brand_id, query_text) VALUES ($1,$2) RETURNING *",
      [q.brand_id, q.query_text],
    );
    return rows[0]!;
  },
  async delete(id: number, brandId: number): Promise<boolean> {
    const { rowCount } = await query(
      "DELETE FROM geo_probe_queries WHERE id = $1 AND brand_id = $2",
      [id, brandId],
    );
    return (rowCount ?? 0) > 0;
  },
};

export const geoCitationChecks = {
  async create(c: {
    brand_id: number;
    probe_query_id: number;
    engine: string;
    mentioned: boolean;
    response_excerpt: string;
    model_used: string;
  }): Promise<GeoCitationCheck> {
    const { rows } = await query<GeoCitationCheck>(
      `INSERT INTO geo_citation_checks
         (brand_id, probe_query_id, engine, mentioned, response_excerpt, model_used)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [c.brand_id, c.probe_query_id, c.engine, c.mentioned, c.response_excerpt, c.model_used],
    );
    return rows[0]!;
  },
  /** Most recent checks first, for the dashboard's recent-activity log. */
  async listRecent(brandId: number, limit = 50): Promise<GeoCitationCheck[]> {
    const { rows } = await query<GeoCitationCheck>(
      "SELECT * FROM geo_citation_checks WHERE brand_id = $1 ORDER BY checked_at DESC LIMIT $2",
      [brandId, limit],
    );
    return rows;
  },
  /** Real mention rate per engine over the last `days` — the actual "GEO
   * score," never estimated. Empty when nothing's been checked yet. */
  async summaryByEngine(
    brandId: number,
    days = 30,
  ): Promise<{ engine: string; checked: number; mentioned: number }[]> {
    const { rows } = await query<{ engine: string; checked: string; mentioned: string }>(
      `SELECT engine, COUNT(*) AS checked, COUNT(*) FILTER (WHERE mentioned) AS mentioned
         FROM geo_citation_checks
        WHERE brand_id = $1 AND checked_at > now() - ($2 || ' days')::interval
        GROUP BY engine
        ORDER BY engine`,
      [brandId, days],
    );
    return rows.map((r) => ({ engine: r.engine, checked: Number(r.checked), mentioned: Number(r.mentioned) }));
  },
};

// ── Technical SEO audits (Okara-comparison follow-up) ──────────────────────
export const seoAudits = {
  async create(a: { brand_id: number; url: string; score: number; checks: SeoCheck[] }): Promise<SeoAudit> {
    const { rows } = await query<SeoAudit>(
      "INSERT INTO seo_audits (brand_id, url, score, checks) VALUES ($1,$2,$3,$4) RETURNING *",
      [a.brand_id, a.url, a.score, JSON.stringify(a.checks)],
    );
    return rows[0]!;
  },
  async listRecent(brandId: number, limit = 20): Promise<SeoAudit[]> {
    const { rows } = await query<SeoAudit>(
      "SELECT * FROM seo_audits WHERE brand_id = $1 ORDER BY created_at DESC LIMIT $2",
      [brandId, limit],
    );
    return rows;
  },
};

// ── Reddit community-engagement agent (Okara-comparison follow-up) ─────────
export const redditSearchTerms = {
  async list(brandId: number): Promise<RedditSearchTerm[]> {
    const { rows } = await query<RedditSearchTerm>(
      "SELECT * FROM reddit_search_terms WHERE brand_id = $1 ORDER BY created_at DESC",
      [brandId],
    );
    return rows;
  },
  async listActive(brandId: number): Promise<RedditSearchTerm[]> {
    const { rows } = await query<RedditSearchTerm>(
      "SELECT * FROM reddit_search_terms WHERE brand_id = $1 AND active = true ORDER BY created_at DESC",
      [brandId],
    );
    return rows;
  },
  async create(t: { brand_id: number; term: string; subreddit?: string | null }): Promise<RedditSearchTerm> {
    const { rows } = await query<RedditSearchTerm>(
      "INSERT INTO reddit_search_terms (brand_id, term, subreddit) VALUES ($1,$2,$3) RETURNING *",
      [t.brand_id, t.term, t.subreddit ?? null],
    );
    return rows[0]!;
  },
  async delete(id: number, brandId: number): Promise<boolean> {
    const { rowCount } = await query(
      "DELETE FROM reddit_search_terms WHERE id = $1 AND brand_id = $2",
      [id, brandId],
    );
    return (rowCount ?? 0) > 0;
  },
};

export const redditOpportunities = {
  async list(brandId: number, limit = 100): Promise<RedditOpportunity[]> {
    const { rows } = await query<RedditOpportunity>(
      "SELECT * FROM reddit_opportunities WHERE brand_id = $1 ORDER BY created_at DESC LIMIT $2",
      [brandId, limit],
    );
    return rows;
  },
  async get(id: number, brandId: number): Promise<RedditOpportunity | null> {
    const { rows } = await query<RedditOpportunity>(
      "SELECT * FROM reddit_opportunities WHERE id = $1 AND brand_id = $2",
      [id, brandId],
    );
    return rows[0] ?? null;
  },
  async create(o: {
    brand_id: number;
    search_term_id: number | null;
    subreddit: string;
    thread_title: string;
    thread_url: string;
    thread_excerpt: string | null;
  }): Promise<RedditOpportunity> {
    const { rows } = await query<RedditOpportunity>(
      `INSERT INTO reddit_opportunities
         (brand_id, search_term_id, subreddit, thread_title, thread_url, thread_excerpt)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (thread_url) DO NOTHING
       RETURNING *`,
      [o.brand_id, o.search_term_id, o.subreddit, o.thread_title, o.thread_url, o.thread_excerpt],
    );
    return rows[0]!;
  },
  async setReply(id: number, brandId: number, reply: string): Promise<RedditOpportunity | null> {
    const { rows } = await query<RedditOpportunity>(
      `UPDATE reddit_opportunities SET suggested_reply = $3, status = 'drafted'
       WHERE id = $1 AND brand_id = $2 RETURNING *`,
      [id, brandId, reply],
    );
    return rows[0] ?? null;
  },
  async setStatus(
    id: number,
    brandId: number,
    status: "posted" | "dismissed",
  ): Promise<RedditOpportunity | null> {
    const { rows } = await query<RedditOpportunity>(
      "UPDATE reddit_opportunities SET status = $3 WHERE id = $1 AND brand_id = $2 RETURNING *",
      [id, brandId, status],
    );
    return rows[0] ?? null;
  },
};

// ── Insights (editorial memo) ─────────────────────────────────────────────────
export const insights = {
  async insert(i: { brand_id: number; period: string; memo: string }): Promise<void> {
    await query("INSERT INTO insights (brand_id, period, memo) VALUES ($1,$2,$3)", [
      i.brand_id,
      i.period,
      i.memo,
    ]);
  },
  /** Dashboard view (audit Phase 1) — the editorial memo previously reached only Telegram. */
  async list(brandId: number, limit = 24): Promise<{ id: number; period: string; memo: string; created_at: Date }[]> {
    const { rows } = await query<{ id: number; period: string; memo: string; created_at: Date }>(
      "SELECT id, period, memo, created_at FROM insights WHERE brand_id = $1 ORDER BY created_at DESC LIMIT $2",
      [brandId, limit],
    );
    return rows;
  },
};

// ── Users (named-account auth, audit Phase 0) ─────────────────────────────────
export const users = {
  async count(): Promise<number> {
    const { rows } = await query<{ n: string }>("SELECT count(*)::int AS n FROM users");
    return Number(rows[0]?.n ?? 0);
  },
  async getByName(name: string): Promise<User | null> {
    const { rows } = await query<User>("SELECT * FROM users WHERE name = $1 AND active = true", [name]);
    return rows[0] ?? null;
  },
  async create(u: { name: string; password_hash: string }): Promise<User> {
    const { rows } = await query<User>(
      "INSERT INTO users (name, password_hash) VALUES ($1,$2) RETURNING *",
      [u.name, u.password_hash],
    );
    return rows[0]!;
  },
  /** Names only — for the "who's on the team" list, never expose password_hash. */
  async list(): Promise<{ id: number; name: string; active: boolean; created_at: Date }[]> {
    const { rows } = await query<{ id: number; name: string; active: boolean; created_at: Date }>(
      "SELECT id, name, active, created_at FROM users ORDER BY id",
    );
    return rows;
  },
};
