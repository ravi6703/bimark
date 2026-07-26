-- Reddit community-engagement agent (Okara-comparison follow-up) — draft-only
-- for v1, same posture as GEO/YouTube: discovers real public threads (Reddit's
-- own public search JSON, no API key), a human drafts/reviews a reply, then
-- copies it to actually post themselves. No auto-posting — that would need a
-- Reddit API app + an account to post through, a real vendor/credential
-- decision like Ayrshare was for social publishing.

CREATE TABLE IF NOT EXISTS reddit_search_terms (
  id          SERIAL PRIMARY KEY,
  brand_id    INT NOT NULL REFERENCES brands(id),
  term        TEXT NOT NULL,
  subreddit   TEXT,              -- optional — NULL/empty searches all of Reddit
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reddit_search_terms_brand ON reddit_search_terms(brand_id);

CREATE TABLE IF NOT EXISTS reddit_opportunities (
  id               SERIAL PRIMARY KEY,
  brand_id         INT NOT NULL REFERENCES brands(id),
  search_term_id   INT REFERENCES reddit_search_terms(id),
  subreddit        TEXT NOT NULL,
  thread_title     TEXT NOT NULL,
  thread_url       TEXT NOT NULL UNIQUE,
  thread_excerpt    TEXT,
  suggested_reply  TEXT,          -- NULL until "Draft reply" is used
  status           TEXT NOT NULL DEFAULT 'new', -- new | drafted | posted | dismissed
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reddit_opportunities_brand ON reddit_opportunities(brand_id, created_at DESC);
