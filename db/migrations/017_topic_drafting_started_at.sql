-- When a topic entered `drafting`, so stalled generations can be recovered.
--
-- WF-4 releases a topic back to `picked` if generation throws, but that's a
-- catch block: it does nothing when the serverless runtime kills the function
-- mid-generation (the 60s cap, an eviction, a crash). Those topics sit in
-- `drafting` forever with no draft, and the drain cron never sees them because
-- it only looks for `picked`.
--
-- Recovering them means knowing how long a topic has been drafting, which
-- `created_at` can't answer — a topic queued an hour ago may have been claimed
-- one second ago. Without this column the recovery sweep would have to guess,
-- and guessing wrong means releasing a healthy in-flight topic to a second
-- worker and generating the draft twice.

ALTER TABLE topics ADD COLUMN IF NOT EXISTS drafting_started_at TIMESTAMPTZ;

-- Anything already stuck in `drafting` predates the claim that sets this, so
-- stamp it now: the recovery sweep will pick it up once the grace period
-- elapses rather than leaving it stranded forever.
UPDATE topics SET drafting_started_at = now()
 WHERE status = 'drafting' AND drafting_started_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_topics_drafting_started
    ON topics(drafting_started_at)
 WHERE status = 'drafting';
