-- Move 5 — turn prompt changes from opinion into measurement.
--
-- `drafts.prompt_version` has been written on every draft since the first
-- commit and has never once been read back. That means no prompt change in the
-- product's history can be shown to have helped or hurt. These two tables fix
-- that using work the team has ALREADY done: every draft that a human approved
-- with edits is a labelled example of "what the AI wrote" versus "what a person
-- was willing to publish".
--
-- Note the split: the per-prompt_version REPORT needs no tables at all (it's a
-- query over approvals + drafts, see src/eval/report.ts). These tables are only
-- for the replay harness, which re-runs a frozen case through today's prompts
-- and scores the result against the human's version.

-- Preserve what the AI actually wrote.
--
-- Approve-with-edits calls drafts.setBody(), which overwrites `body` with the
-- human's text — so the AI's original was destroyed on exactly the drafts that
-- are most worth learning from. Without this column an "AI vs human" case can
-- only ever compare the human's text to itself.
--
-- Backfilled from `body` for existing rows, which is correct for every draft
-- that was never edited and wrong for the ones that were. Those are
-- identifiable (approvals.action = 'edit') and are excluded from harvesting by
-- src/eval/goldenSet.ts rather than being silently scored as zero-change.
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS ai_body TEXT;
UPDATE drafts SET ai_body = body WHERE ai_body IS NULL;

-- One frozen example. `human_body` is the text a person actually approved, and
-- is the target a replay is scored against.
CREATE TABLE IF NOT EXISTS eval_cases (
  id             SERIAL PRIMARY KEY,
  brand_id       INT NOT NULL REFERENCES brands(id),
  -- The draft this was frozen from. Kept for provenance; the case stays valid
  -- (and comparable) even if the draft is later deleted, hence ON DELETE SET NULL.
  source_draft_id INT REFERENCES drafts(id) ON DELETE SET NULL,
  -- Replay re-runs generation for this topic, so retrieval runs again too. That
  -- is deliberate: what the team cares about is whether the PIPELINE got better,
  -- not whether one prompt string did in isolation.
  topic_id       INT REFERENCES topics(id) ON DELETE SET NULL,
  platform       TEXT NOT NULL,
  angle          TEXT,
  ai_body        TEXT NOT NULL,
  human_body     TEXT NOT NULL,
  -- What produced ai_body, so a case can be excluded from evaluating the very
  -- version that generated it.
  prompt_version TEXT,
  edit_distance  INT,
  added_by       TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eval_cases_brand_idx ON eval_cases (brand_id, created_at DESC);
-- A given draft is only worth freezing once.
CREATE UNIQUE INDEX IF NOT EXISTS eval_cases_source_draft_key
  ON eval_cases (source_draft_id) WHERE source_draft_id IS NOT NULL;

-- One scored replay of the whole set against one prompt version.
CREATE TABLE IF NOT EXISTS eval_runs (
  id             SERIAL PRIMARY KEY,
  brand_id       INT NOT NULL REFERENCES brands(id),
  prompt_version TEXT NOT NULL,
  cases_run      INT NOT NULL,
  -- Mean cosine similarity between the replayed draft and the human's version.
  -- Higher is better: the AI is landing closer to what a person would ship.
  mean_similarity NUMERIC,
  -- Mean normalized edit distance from the replay to the human version. Lower
  -- is better. Reported alongside similarity because the two disagree in
  -- informative ways — a rewrite that means the same thing scores well on one
  -- and badly on the other.
  mean_edit_distance NUMERIC,
  -- Per-case detail, so a bad mean can be traced to the case that caused it
  -- instead of just being a worse number.
  detail         JSONB,
  ran_by         TEXT NOT NULL,
  ran_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eval_runs_brand_idx ON eval_runs (brand_id, ran_at DESC);
