-- Brand logo (LinkedIn multi-image follow-up) — lets generated post images be
-- watermarked with the brand's real logo instead of shipping with none.
-- Self-hosted the same way as generated media (assets.data/mime_type,
-- migration 003) rather than external object storage. NULL means "no logo
-- uploaded yet" — generated images are used as-is, no placeholder mark.
ALTER TABLE brands ADD COLUMN IF NOT EXISTS logo_mime_type TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS logo_data BYTEA;
