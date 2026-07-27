-- Move 1 — make the goal measurable.
--
-- The platform measured impressions/engagements/clicks/saves/shares/comments
-- and nothing else, while the stated definition of success is inbound leads
-- and marketing hours saved. Nothing in the schema could hold either number,
-- so no screen could ever report one. These are the two smallest tables that
-- close that gap.
--
-- Deliberately NOT a CRM integration. Both tables hold numbers a human (or a
-- later import) records; the platform's job is to attribute them to real
-- published posts and do the arithmetic, not to invent them.

-- ── Attribution ──────────────────────────────────────────────────────────────
-- The UTM campaign value actually stamped onto this post's own links at
-- publish time. NULL means the post carried no stampable link (no link at all,
-- or only third-party links, which are deliberately left alone). Without this
-- recorded at publish, no analytics tool downstream can separate bimark's
-- contribution from the rest of the site's traffic.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

CREATE INDEX IF NOT EXISTS posts_utm_campaign_idx
  ON posts (utm_campaign) WHERE utm_campaign IS NOT NULL;

-- ── Outcomes ─────────────────────────────────────────────────────────────────
-- A recorded business result. post_id NULL means "this brand got N leads this
-- week and we can't attribute them to one post" — which is the honest and
-- common case, and still far more useful than counting impressions.
CREATE TABLE IF NOT EXISTS outcomes (
  id           SERIAL PRIMARY KEY,
  brand_id     INT NOT NULL REFERENCES brands(id),
  post_id      INT REFERENCES posts(id),
  -- Monday of the week this covers. Weekly is the smallest period anyone can
  -- report honestly by hand, and matches the weekly_target cadence already in
  -- channel_configs.
  period_start DATE NOT NULL,
  leads        INT NOT NULL DEFAULT 0,
  signups      INT NOT NULL DEFAULT 0,
  -- Where the number came from, so a reader can weigh it: 'manual' (someone
  -- counted), 'analytics' (a GA/traffic export), 'crm' (a real system).
  source       TEXT NOT NULL DEFAULT 'manual',
  note         TEXT,
  recorded_by  TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT outcomes_nonneg CHECK (leads >= 0 AND signups >= 0)
);

CREATE INDEX IF NOT EXISTS outcomes_brand_period_idx
  ON outcomes (brand_id, period_start DESC);

-- ── Hours saved ──────────────────────────────────────────────────────────────
-- Both numbers are the team's own estimates, and every surface that uses them
-- says so. That is the honest construction: the platform contributes the one
-- thing it can actually measure (how many posts really shipped) and multiplies
-- it by a figure a human owns, rather than inventing a productivity number.
--
-- Capture the "before" figure BEFORE wider rollout — once the team has been
-- using bimark for a month, nobody can recall it accurately.
CREATE TABLE IF NOT EXISTS time_baselines (
  id                     SERIAL PRIMARY KEY,
  brand_id               INT NOT NULL REFERENCES brands(id),
  -- End-to-end minutes for one post the old way: research, draft, edit,
  -- image, review, schedule.
  minutes_per_post_before INT NOT NULL,
  -- End-to-end minutes for one post through bimark, as the team estimates it
  -- today. Editable later as the tool changes; each edit is a new row so the
  -- history is preserved rather than overwritten.
  minutes_per_post_after  INT NOT NULL,
  note                    TEXT,
  recorded_by             TEXT NOT NULL,
  captured_at             TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT time_baselines_positive CHECK (
    minutes_per_post_before > 0 AND minutes_per_post_after >= 0
  )
);

CREATE INDEX IF NOT EXISTS time_baselines_brand_idx
  ON time_baselines (brand_id, captured_at DESC);
