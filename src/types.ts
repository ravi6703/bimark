/** Domain types mirroring the §15 schema. */

export type TopicSource = "morning_pitch" | "manual" | "trend";
export type TopicStatus =
  | "suggested"
  | "picked"
  | "skipped"
  | "drafting"
  | "drafted"
  | "archived";
export type DraftStatus =
  | "generating"
  | "in_review"
  | "flagged"
  | "pending_approval"
  | "approved"
  | "edited"
  | "rejected";
export type Platform = "linkedin" | "x" | "instagram";

export interface Brand {
  id: number;
  name: string;
  voice_guide: string | null;
  visual_notes: string | null;
  banned_topics: string[] | null;
  created_at: Date;
}

export interface Pillar {
  id: number;
  brand_id: number;
  name: string;
  description: string | null;
  active: boolean;
}

export interface OwnedAsset {
  id: number;
  brand_id: number;
  source_type: string | null;
  source_ref: string | null;
  title: string | null;
  chunk_text: string | null;
  chunk_index: number;
  content_hash: string | null;
  pillar_hint: number | null;
  last_used_at: Date | null;
  updated_at: Date;
}

/** An owned-asset row plus its cosine similarity for a given query. */
export interface RetrievedChunk extends OwnedAsset {
  similarity: number;
}

export interface ChannelConfig {
  id: number;
  brand_id: number;
  platform: string;
  weekly_target: number | null;
  allowed_media: string[] | null;
  monthly_budget_usd: number | null;
  active: boolean;
}

export interface Topic {
  id: number;
  brand_id: number;
  source: TopicSource;
  pillar_id: number | null;
  angle: string | null;
  why_now: string | null;
  source_asset_id: number | null;
  platform: string;
  format_hint: string | null;
  must_say: string | null;
  priority: number;
  status: TopicStatus;
  pitch_group: string | null;
  created_at: Date;
}

export interface ReviewerResult {
  verdict: "pass" | "flag";
  flags: string[];
  notes: string;
}

export interface Draft {
  id: number;
  topic_id: number;
  platform: string;
  body: string | null;
  variants: string[] | null;
  claims_used: string[] | null;
  low_source: boolean;
  media_asset_id: number | null;
  model_used: string | null;
  prompt_version: string | null;
  reviewer_result: ReviewerResult | null;
  review_retries: number;
  status: DraftStatus;
  created_at: Date;
}

/** A draft joined with its topic's angle/pillar for dashboard display. */
export interface DraftWithContext extends Draft {
  topic_angle: string | null;
  pillar_name: string | null;
  brand_id: number;
}

export interface MediaAsset {
  id: number;
  draft_id: number;
  type: "image" | "video";
  mime_type: string;
  data: Buffer;
  model_used: string | null;
}

export interface Post {
  id: number;
  draft_id: number;
  platform: string;
  external_id: string | null;
  url: string | null;
  scheduled_at: Date | null;
  published_at: Date | null;
  poll_until: Date | null;
}
