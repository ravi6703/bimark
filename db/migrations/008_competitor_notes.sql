-- Competitor intelligence log (Okara-inspired follow-up). This is a manual
-- log, not an auto-refreshing feed — there's no scraping/monitoring data
-- source wired up here (that's a vendor decision, the same class of call
-- Brand24 was for SOV). It gives the team one place to record what a
-- competitor did and what to learn from it, instead of that living in
-- scattered Slack messages.
CREATE TABLE IF NOT EXISTS competitor_notes (
  id              SERIAL PRIMARY KEY,
  brand_id        INT REFERENCES brands(id),
  competitor_name TEXT NOT NULL,
  source_url      TEXT,
  summary         TEXT NOT NULL,   -- what they did
  learning        TEXT,            -- what we can learn / apply from it
  added_by        TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS competitor_notes_brand_idx ON competitor_notes(brand_id, competitor_name);
