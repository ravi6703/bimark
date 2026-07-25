-- Distinctiveness guard (audit Phase 3, §1 "95-5 rule / distinctiveness over
-- volume"): the pipeline had no check for "haven't we already said this,"
-- only for whether source material was thin (low_source). Reuses the same
-- pgvector infrastructure already used for owned-material retrieval.
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS repetitive BOOLEAN DEFAULT false;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS similar_to_draft_id INT REFERENCES drafts(id);
