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
  | "approved_hold" // approved but held — no platform draft API exists, so it waits here for a manual publish
  | "edited"
  | "rejected";
export type Platform = "linkedin" | "x" | "instagram" | "geo" | "youtube";

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

/** Structured per-platform guidance (§20), one shape per platform. */
export interface LinkedInExtra {
  audience?: string;
  cta?: string;
}
export interface XExtra {
  angleStyle?: "hot-take" | "informative" | "question";
}
export interface InstagramExtra {
  visualStyle?: "photography" | "illustration" | "infographic";
}
/** GEO (generative-engine optimization) — content aimed at being cited by AI
 * answer engines, not a social platform. No publish API exists for this
 * (there's no "post to ChatGPT"); see wf5_approvalCallback.ts's geo handling. */
export interface GeoExtra {
  targetQuestion?: string;
}
/** YouTube — bimark has no video-generation pipeline, so this drafts a
 * script/outline (title, hook, talking points) for a human to shoot and
 * upload, not a finished video. No publish API exists for this either;
 * see wf5_approvalCallback.ts's youtube handling (same "hold" pattern as GEO). */
export interface YoutubeExtra {
  videoAngle?: "tutorial" | "explainer" | "interview-clip";
}
export type PlatformExtra = LinkedInExtra | XExtra | InstagramExtra | GeoExtra | YoutubeExtra;

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
  platform_extra: PlatformExtra | null;
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
  /** Distinctiveness guard (audit Phase 3) — flags a likely repeat of a recent post. */
  repetitive: boolean;
  similar_to_draft_id: number | null;
}

/** A draft joined with its topic's angle/pillar for dashboard display. */
export interface DraftWithContext extends Draft {
  topic_angle: string | null;
  pillar_name: string | null;
  brand_id: number;
  /** Rationale fields (Okara-inspired follow-up) — why this draft exists at all. */
  topic_why_now: string | null;
  topic_source: TopicSource | null;
  topic_format_hint: string | null;
  topic_platform_extra: PlatformExtra | null;
}

export interface MediaAsset {
  id: number;
  draft_id: number;
  type: "image" | "video";
  mime_type: string;
  data: Buffer;
  model_used: string | null;
}

/** A named dashboard account (audit Phase 0 — replaces the shared password). */
export interface User {
  id: number;
  name: string;
  password_hash: string;
  active: boolean;
  created_at: Date;
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

/** A post joined with its draft/topic for the calendar view (audit Phase 2). */
export interface PostWithContext extends Post {
  body: string | null;
  media_asset_id: number | null;
  pillar_name: string | null;
}

/** One row of a draft's audit trail (audit Phase 2 — makes Phase 0's identity fix visible). */
export interface ApprovalEntry {
  id: number;
  approver: string;
  action: "approve" | "edit" | "reject" | "publish";
  reason: string | null;
  edit_distance: number | null;
  created_at: Date;
}

/** AI-derived onboarding proposal (Okara-inspired) — read a URL, propose a
 * starting brand profile. Purely a proposal: nothing is persisted until the
 * human reviews and explicitly applies it. */
export interface BrandProfileProposal {
  voiceGuide: string;
  visualNotes: string;
  bannedTopics: string[];
  pillars: { name: string; description: string }[];
}

/** Competitor intelligence log entry (Okara-inspired follow-up) — a manual
 * note about what a named competitor did, and what to learn from it. Not an
 * auto-refreshing feed; see src/workflows/wf7_sovMemo.ts#DEFAULT_COMPETITORS
 * for the tracked competitor set and README §12 for why this is manual. */
export interface CompetitorNote {
  id: number;
  brand_id: number;
  competitor_name: string;
  source_url: string | null;
  summary: string;
  learning: string | null;
  added_by: string;
  created_at: Date;
}
