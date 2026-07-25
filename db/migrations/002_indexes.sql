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
