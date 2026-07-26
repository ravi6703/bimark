-- Per-brand publish credentials (multi-brand support follow-up) — each brand
-- line posts through its own connected LinkedIn/X/Instagram accounts, not one
-- shared set. Ayrshare supports this via either a separate API key per brand
-- or, on Ayrshare's multi-profile plan, one API key + a per-brand
-- "Profile-Key" header — both are nullable overrides here so either model
-- works without a code change. NULL means "use the shared/global publisher
-- config" (config.publish.* / AYRSHARE_API_KEY) — unchanged behavior for any
-- brand that hasn't had its own connected yet.
ALTER TABLE brands ADD COLUMN IF NOT EXISTS ayrshare_api_key TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS ayrshare_profile_key TEXT;
