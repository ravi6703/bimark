-- ═══════════════════════════════════════════════════════════════════════════
-- Combined migration bundle for pasting into the Supabase SQL Editor.
-- (Supabase → your project → SQL Editor → New query → paste this whole file → Run)
-- Equivalent to running db/migrations/001_init.sql then 002_indexes.sql.
-- Safe to re-run: every statement is IF NOT EXISTS / idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Brand Visibility Engine — core schema (PRD §15)
-- Postgres + pgvector. Retrieval lives in the same DB (no separate vector store).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS vector;

-- Brands (multi-brand ready, MVP uses one row)
CREATE TABLE IF NOT EXISTS brands (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  voice_guide   TEXT,              -- the brand voice definition (§17.1)
  visual_notes  TEXT,
  banned_topics TEXT[],            -- reviewer hard-blocks
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Topic pillars (the 3–5 things BI wants to own)
CREATE TABLE IF NOT EXISTS pillars (
  id          SERIAL PRIMARY KEY,
  brand_id    INT REFERENCES brands(id),
  name        TEXT NOT NULL,
  description TEXT,
  active      BOOLEAN DEFAULT true
);

-- Owned material index (one row per ingested source chunk) — RAG store
CREATE TABLE IF NOT EXISTS owned_assets (
  id           SERIAL PRIMARY KEY,
  brand_id     INT REFERENCES brands(id),
  source_type  TEXT,              -- 'gdrive' | 'notion' | 'deck' | 'manual'
  source_ref   TEXT,              -- file id / url
  title        TEXT,
  chunk_text   TEXT,              -- the retrievable text
  chunk_index  INT DEFAULT 0,     -- ordinal within the source file
  content_hash TEXT,              -- per-file hash to skip unchanged files (§18.6)
  embedding    vector(1536),      -- dim depends on embedding model (EMBED_DIM)
  pillar_hint  INT REFERENCES pillars(id),
  last_used_at TIMESTAMPTZ,       -- for "not-recently-used" pitch spread (WF-1.3)
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Per-platform config (frequency, allowed media, budget)
CREATE TABLE IF NOT EXISTS channel_configs (
  id                 SERIAL PRIMARY KEY,
  brand_id           INT REFERENCES brands(id),
  platform           TEXT,              -- 'linkedin' | 'x' | 'instagram'
  weekly_target      INT,               -- e.g. 3
  allowed_media      TEXT[],            -- {'text','image'}
  monthly_budget_usd NUMERIC,
  active             BOOLEAN DEFAULT true
);

-- Topics/concepts entering the pipeline
DO $$ BEGIN
  CREATE TYPE topic_source AS ENUM ('morning_pitch','manual','trend');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE topic_status AS ENUM ('suggested','picked','skipped','drafting','drafted','archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS topics (
  id              SERIAL PRIMARY KEY,
  brand_id        INT REFERENCES brands(id),
  source          topic_source,
  pillar_id       INT REFERENCES pillars(id),
  angle           TEXT,              -- the hook / framing
  why_now         TEXT,
  source_asset_id INT REFERENCES owned_assets(id),
  platform        TEXT DEFAULT 'linkedin',
  format_hint     TEXT,              -- e.g. 'text_pov' | 'carousel'
  must_say        TEXT,              -- optional must-say points (§4.2)
  priority        INT DEFAULT 0,     -- manual topics get higher priority
  status          topic_status DEFAULT 'suggested',
  pitch_group     TEXT,              -- correlates the A/B pair from one morning pitch
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Drafts
DO $$ BEGIN
  CREATE TYPE draft_status AS ENUM ('generating','in_review','flagged','pending_approval','approved','edited','rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS drafts (
  id              SERIAL PRIMARY KEY,
  topic_id        INT REFERENCES topics(id),
  platform        TEXT,
  body            TEXT,
  variants        JSONB,           -- alternate copy options
  claims_used     JSONB,           -- claims traced back to source (§17.3)
  low_source      BOOLEAN DEFAULT false, -- credibility guard (§4.2 / §18.5)
  media_asset_id  INT,             -- FK to generated assets (nullable)
  model_used      TEXT,
  prompt_version  TEXT,
  reviewer_result JSONB,           -- brand-safety agent output (§17.4)
  review_retries  INT DEFAULT 0,
  status          draft_status DEFAULT 'generating',
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Generated media assets (images/video)
CREATE TABLE IF NOT EXISTS assets (
  id          SERIAL PRIMARY KEY,
  draft_id    INT REFERENCES drafts(id),
  type        TEXT,              -- 'image' | 'video'
  s3_url      TEXT,
  model_used  TEXT,
  cost_usd    NUMERIC
);

-- Approval audit trail
CREATE TABLE IF NOT EXISTS approvals (
  id            SERIAL PRIMARY KEY,
  draft_id      INT REFERENCES drafts(id),
  approver      TEXT,              -- telegram user
  action        TEXT,              -- 'approve' | 'edit' | 'reject'
  reason        TEXT,
  edit_distance INT,              -- chars changed vs AI draft (§7 metric)
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Published posts
CREATE TABLE IF NOT EXISTS posts (
  id              SERIAL PRIMARY KEY,
  draft_id        INT REFERENCES drafts(id),
  platform        TEXT,
  external_id     TEXT,             -- platform post id
  url             TEXT,
  scheduled_at    TIMESTAMPTZ,
  published_at    TIMESTAMPTZ,
  poll_until      TIMESTAMPTZ       -- end of the velocity polling window (§7.1 / WF-6)
);

-- Performance metrics (timeseries, velocity-window polling — §7.1)
CREATE TABLE IF NOT EXISTS metrics (
  id          SERIAL PRIMARY KEY,
  post_id     INT REFERENCES posts(id),
  polled_at   TIMESTAMPTZ DEFAULT now(),
  impressions INT, engagements INT, clicks INT, saves INT, shares INT, comments INT
);

-- Share of voice snapshots (§19)
CREATE TABLE IF NOT EXISTS sov_snapshots (
  id                SERIAL PRIMARY KEY,
  brand_id          INT REFERENCES brands(id),
  captured_at       TIMESTAMPTZ DEFAULT now(),
  pillar_id         INT REFERENCES pillars(id),
  bi_score          NUMERIC,           -- our mentions/engagements on the topic
  competitor_scores JSONB,             -- {"Hurix": n, "MRCC": n, ...}
  sov_pct           NUMERIC            -- bi_score / (bi + competitors)
);

-- Editorial insight memos (§18 optimizer output)
CREATE TABLE IF NOT EXISTS insights (
  id          SERIAL PRIMARY KEY,
  brand_id    INT REFERENCES brands(id),
  period      TEXT,              -- '2026-07'
  memo        TEXT,              -- human-readable
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes (PRD §15). The ivfflat vector index needs data present to train its
-- lists; at MVP scale an exact scan is fine, so this is created best-effort.
-- ─────────────────────────────────────────────────────────────────────────────

-- Vector similarity (cosine) over owned material.
CREATE INDEX IF NOT EXISTS owned_assets_embedding_idx
  ON owned_assets USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Common lookups exercised by the workflows.
CREATE INDEX IF NOT EXISTS owned_assets_brand_idx        ON owned_assets (brand_id);
CREATE INDEX IF NOT EXISTS owned_assets_source_ref_idx   ON owned_assets (source_ref);
CREATE INDEX IF NOT EXISTS pillars_brand_active_idx      ON pillars (brand_id, active);
CREATE INDEX IF NOT EXISTS topics_status_priority_idx    ON topics (status, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS topics_pitch_group_idx        ON topics (pitch_group);
CREATE INDEX IF NOT EXISTS drafts_topic_idx              ON drafts (topic_id);
CREATE INDEX IF NOT EXISTS drafts_status_idx             ON drafts (status);
CREATE INDEX IF NOT EXISTS posts_poll_until_idx          ON posts (poll_until);
CREATE INDEX IF NOT EXISTS metrics_post_idx              ON metrics (post_id, polled_at);
CREATE INDEX IF NOT EXISTS sov_brand_captured_idx        ON sov_snapshots (brand_id, captured_at);
