import type {
  Brand,
  ChannelConfig,
  Draft,
  DraftStatus,
  DraftWithContext,
  MediaAsset,
  OwnedAsset,
  Pillar,
  Post,
  ReviewerResult,
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
  /** The MVP runs single-brand; this resolves that default brand. */
  async first(): Promise<Brand | null> {
    const { rows } = await query<Brand>("SELECT * FROM brands ORDER BY id LIMIT 1");
    return rows[0] ?? null;
  },
  async create(b: {
    name: string;
    voice_guide?: string;
    visual_notes?: string;
    banned_topics?: string[];
  }): Promise<Brand> {
    const { rows } = await query<Brand>(
      `INSERT INTO brands (name, voice_guide, visual_notes, banned_topics)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [b.name, b.voice_guide ?? null, b.visual_notes ?? null, b.banned_topics ?? null],
    );
    return rows[0]!;
  },
  async update(
    id: number,
    b: { voice_guide?: string; visual_notes?: string; banned_topics?: string[] },
  ): Promise<Brand | null> {
    const { rows } = await query<Brand>(
      `UPDATE brands SET
         voice_guide = COALESCE($2, voice_guide),
         visual_notes = COALESCE($3, visual_notes),
         banned_topics = COALESCE($4, banned_topics)
       WHERE id = $1 RETURNING *`,
      [id, b.voice_guide ?? null, b.visual_notes ?? null, b.banned_topics ?? null],
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
  /** For the dashboard's review queue — joins the topic's angle/pillar for context. */
  async listWithContext(
    brandId: number,
    opts: { status?: DraftStatus; limit?: number } = {},
  ): Promise<DraftWithContext[]> {
    const limit = opts.limit ?? 50;
    const statusClause = opts.status ? "AND d.status = $2" : "";
    const params: unknown[] = opts.status ? [brandId, opts.status, limit] : [brandId, limit];
    const { rows } = await query<DraftWithContext>(
      `SELECT d.*, t.angle AS topic_angle, t.brand_id AS brand_id, pl.name AS pillar_name
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
  async qualityStats(): Promise<{
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
         count(*) FILTER (WHERE action = 'approve') AS approvals,
         count(*) FILTER (WHERE action = 'edit')    AS edits,
         count(*) FILTER (WHERE action = 'reject')  AS rejects,
         avg(edit_distance) FILTER (WHERE action IN ('approve','edit')) AS mean_edit
       FROM approvals`,
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
  async withinPollingWindow(now: Date): Promise<Post[]> {
    const { rows } = await query<Post>(
      "SELECT * FROM posts WHERE poll_until IS NOT NULL AND poll_until > $1",
      [now],
    );
    return rows;
  },
  /** Cadence rollup (audit Phase 1) — how many posts actually went out since `since`. */
  async countPublishedSince(since: Date): Promise<number> {
    const { rows } = await query<{ n: string }>(
      "SELECT count(*)::int AS n FROM posts WHERE published_at >= $1",
      [since],
    );
    return Number(rows[0]?.n ?? 0);
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
