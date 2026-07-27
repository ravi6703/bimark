-- Move 4 — let pillars carry intent.
--
-- src/agents/prompts.ts instructs every generation toward "CREDIBILITY, not
-- lead-gen". That is well executed and worth keeping, but it is applied
-- uniformly, which means no post ever offers a next step and therefore no post
-- can generate attributable inbound.
--
-- The resolution isn't "add CTAs everywhere" — that would destroy the
-- credibility that makes the inbound worth having. It's per-pillar: some
-- pillars exist to build authority and keep the current instruction verbatim,
-- others exist to convert and get one explicit, tasteful next step.
--
-- 'authority' is the default precisely so this migration changes no existing
-- behaviour. Every pillar that exists today keeps generating exactly what it
-- generates now until a human deliberately marks one 'conversion'.

DO $$ BEGIN
  CREATE TYPE pillar_intent AS ENUM ('authority', 'conversion');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE pillars
  ADD COLUMN IF NOT EXISTS intent pillar_intent NOT NULL DEFAULT 'authority';

-- What a conversion pillar should point the reader toward — a specific page,
-- programme, or action. Free text, because the useful next step differs per
-- pillar and a fixed list would be wrong immediately. NULL on an 'authority'
-- pillar, and ignored if set there.
ALTER TABLE pillars
  ADD COLUMN IF NOT EXISTS conversion_target TEXT;
