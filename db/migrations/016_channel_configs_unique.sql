-- One channel config per (brand, platform).
--
-- channel_configs was only ever written by the seed, so nothing enforced
-- uniqueness. Now that weekly_target actually drives which channel the
-- morning pitch targets (WF-1.2) it's editable from the dashboard, and an
-- upsert needs a constraint to conflict on. Without it a brand could
-- accumulate several rows for the same channel and pickPitchPlatform would
-- read whichever came back first.

-- Collapse any pre-existing duplicates first, keeping the lowest id per
-- (brand, platform) — they'd all have come from repeated seeding, so they
-- carry the same values and there's nothing to reconcile.
DELETE FROM channel_configs c
 WHERE EXISTS (
   SELECT 1 FROM channel_configs keep
    WHERE keep.brand_id = c.brand_id
      AND keep.platform = c.platform
      AND keep.id < c.id
 );

-- Guarded so re-running is a no-op: ADD CONSTRAINT has no IF NOT EXISTS, and
-- an unguarded one aborts the whole script when the constraint is already
-- there — which matters when this is pasted into a SQL console by hand rather
-- than run through the migration runner's once-only bookkeeping.
DO $$ BEGIN
  ALTER TABLE channel_configs
    ADD CONSTRAINT channel_configs_brand_platform_key UNIQUE (brand_id, platform);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
