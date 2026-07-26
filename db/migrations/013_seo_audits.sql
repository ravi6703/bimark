-- Technical SEO audit agent (Okara-comparison follow-up) — a real, rule-based
-- audit of the brand's actual website HTML/robots.txt/sitemap.xml, with
-- plain-language fix suggestions. Deliberately does NOT open GitHub pull
-- requests for fixes yet (that needs a repo + write-access token, a real
-- decision for the user to make) — this ships the audit + "here's what to
-- change and why" half first, same posture as the GEO citation tracker.

ALTER TABLE brands ADD COLUMN IF NOT EXISTS site_url TEXT;

CREATE TABLE IF NOT EXISTS seo_audits (
  id          SERIAL PRIMARY KEY,
  brand_id    INT NOT NULL REFERENCES brands(id),
  url         TEXT NOT NULL,
  score       INT NOT NULL,       -- 0-100, percentage of checks passed
  checks      JSONB NOT NULL,     -- [{label, pass, detail, fix}], the real check results
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_seo_audits_brand ON seo_audits(brand_id, created_at DESC);
