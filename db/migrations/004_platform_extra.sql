-- Per-platform structured guidance (§20 platform-specific fields), e.g.
-- LinkedIn audience/CTA, X angle style, Instagram visual style. One topic
-- row exists per platform already (WF-3), so this holds just that platform's
-- details — no need to disambiguate by platform key inside the JSON.
ALTER TABLE topics ADD COLUMN IF NOT EXISTS platform_extra JSONB;
