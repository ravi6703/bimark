-- GEO citation/visibility tracking (Okara-comparison follow-up) — bimark's
-- existing GEO platform *writes* AI-answer-engine-optimized content but never
-- checked whether it actually gets cited. This closes that loop: real probe
-- questions, genuinely sent to a configured AI engine, checked for whether
-- the brand's own name shows up in the answer. No score is ever synthesized
-- for an engine that isn't actually configured — the honesty posture used
-- everywhere else in this app (SOV, competitor monitoring, etc.).

CREATE TABLE IF NOT EXISTS geo_probe_queries (
  id          SERIAL PRIMARY KEY,
  brand_id    INT NOT NULL REFERENCES brands(id),
  query_text  TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_geo_probe_queries_brand ON geo_probe_queries(brand_id);

CREATE TABLE IF NOT EXISTS geo_citation_checks (
  id               SERIAL PRIMARY KEY,
  brand_id         INT NOT NULL REFERENCES brands(id),
  probe_query_id   INT NOT NULL REFERENCES geo_probe_queries(id),
  engine           TEXT NOT NULL,       -- e.g. 'claude' — the specific engine actually queried
  mentioned        BOOLEAN NOT NULL,    -- did the brand's own name appear in the response?
  response_excerpt TEXT NOT NULL,       -- truncated response, for audit/spot-checking
  model_used       TEXT NOT NULL,
  checked_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_geo_citation_checks_brand ON geo_citation_checks(brand_id, checked_at DESC);
