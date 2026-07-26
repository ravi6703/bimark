-- Multi-brand support (Board Infinity's request to run Leadup Universe,
-- InfyLearn, and the course-production ("Elearning Solutions") line as
-- separate content workspaces alongside Board Infinity's own). The schema
-- was already brand_id-scoped everywhere (§15) — this just adds what the
-- application layer needs to pick WHICH brand a request is for, and gives
-- each brand its own default competitor set instead of one hardcoded list.
ALTER TABLE brands ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS default_competitors TEXT[];

-- Backfill any existing single-brand row with a slug derived from its name
-- (e.g. "Board Infinity" -> "board-infinity") so this migration is safe to
-- run against the already-seeded production DB.
UPDATE brands SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
 WHERE slug IS NULL;

ALTER TABLE brands ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS brands_slug_idx ON brands(slug);
