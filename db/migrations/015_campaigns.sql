-- Campaign entity (architecture review, step 2 of 5).
--
-- One idea — "the skills gap in tier-2 colleges" — used to become N unrelated
-- `topics` rows, one per platform, with nothing linking them: the Topics view
-- showed the same idea five times, and nothing could roll performance up from
-- the channels back to the idea that spawned them.
--
-- `topics` already IS the per-channel job (it carries platform, platform_extra,
-- format_hint and the picked -> drafting -> drafted status machine), so this
-- adds a parent rather than a third table:
--
--     campaigns   the idea
--       └─ topics   per-channel job   (already existed)
--            └─ drafts                (already existed)
--
-- Purely additive: one new table, one new nullable column. Nothing reads
-- campaign_id yet — the writers land in a follow-up — so applying this changes
-- no behaviour.

CREATE TABLE IF NOT EXISTS campaigns (
  id              SERIAL PRIMARY KEY,
  brand_id        INT NOT NULL REFERENCES brands(id),
  title           TEXT NOT NULL,                  -- the idea itself
  pillar_id       INT REFERENCES pillars(id),
  source          topic_source,                   -- morning_pitch | manual | trend
  why_now         TEXT,
  must_say        TEXT,
  source_asset_id INT REFERENCES owned_assets(id),
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_brand ON campaigns(brand_id, created_at DESC);

ALTER TABLE topics ADD COLUMN IF NOT EXISTS campaign_id INT REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_topics_campaign ON topics(campaign_id);

-- Backfill: reconstruct the real campaigns from history rather than inventing
-- them. WF-3 created a multi-platform idea as a tight loop of topic rows
-- sharing one angle, so topics with the same (brand_id, angle) created within
-- seconds of each other genuinely WERE one idea. Anything that doesn't group
-- simply becomes a single-channel campaign, which is also the truth.
--
-- The whole migration runs in one transaction (see src/db/migrate.ts), so a
-- failure here leaves the database exactly as it was.
DO $$
DECLARE
  rec RECORD;
  new_campaign_id INT;
BEGIN
  FOR rec IN
    WITH marked AS (
      SELECT
        id, brand_id, angle, created_at, pillar_id, why_now, must_say,
        source_asset_id, source,
        -- Start a new group whenever this is the first row for a
        -- (brand, angle), or more than 10s elapsed since the previous one.
        CASE
          WHEN LAG(created_at) OVER w IS NULL
            OR created_at - LAG(created_at) OVER w > interval '10 seconds'
          THEN 1 ELSE 0
        END AS is_new_group
      FROM topics
      WHERE campaign_id IS NULL
      WINDOW w AS (PARTITION BY brand_id, angle ORDER BY created_at, id)
    ),
    grouped AS (
      SELECT *,
        SUM(is_new_group) OVER (PARTITION BY brand_id, angle ORDER BY created_at, id) AS grp
      FROM marked
    )
    SELECT
      brand_id,
      angle,
      array_agg(id ORDER BY created_at, id)                       AS topic_ids,
      min(created_at)                                             AS created_at,
      -- Idea-level fields come from the earliest topic in the group; every
      -- member carries the same values, having been written from one intake.
      (array_agg(pillar_id       ORDER BY created_at, id))[1]     AS pillar_id,
      (array_agg(why_now         ORDER BY created_at, id))[1]     AS why_now,
      (array_agg(must_say        ORDER BY created_at, id))[1]     AS must_say,
      (array_agg(source_asset_id ORDER BY created_at, id))[1]     AS source_asset_id,
      (array_agg(source          ORDER BY created_at, id))[1]     AS source
    FROM grouped
    GROUP BY brand_id, angle, grp
  LOOP
    INSERT INTO campaigns
      (brand_id, title, pillar_id, source, why_now, must_say, source_asset_id, created_by, created_at)
    VALUES
      (rec.brand_id, COALESCE(rec.angle, '(untitled)'), rec.pillar_id, rec.source,
       rec.why_now, rec.must_say, rec.source_asset_id, 'backfill', rec.created_at)
    RETURNING id INTO new_campaign_id;

    UPDATE topics SET campaign_id = new_campaign_id WHERE id = ANY(rec.topic_ids);
  END LOOP;
END $$;
