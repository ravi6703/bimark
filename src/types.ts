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
  /** URL-safe identifier (e.g. "leadup-universe") — how the dashboard/API pick
   * which brand's workspace a request is for (multi-brand support). */
  slug: string;
  voice_guide: string | null;
  visual_notes: string | null;
  banned_topics: string[] | null;
  /** Per-brand competitor set for SOV/competitor-dashboard — each brand
   * competes with different companies, so there's no one global list. */
  default_competitors: string[] | null;
  /** Per-brand publish credentials (multi-brand support follow-up) — NULL
   * falls back to the shared/global publisher config (config.publish.*). See
   * db/migrations/010_brand_publish_credentials.sql for the two ways this
   * can be set up (separate Ayrshare account per brand, or one account's
   * multi-profile plan with a per-brand Profile-Key). */
  ayrshare_api_key: string | null;
  ayrshare_profile_key: string | null;
  /** Real brand logo, self-hosted the same way generated media is (migration
   * 011) — used to watermark generated post images. NULL means no logo has
   * been uploaded yet, so images generate without one (no placeholder mark). */
  logo_mime_type: string | null;
  logo_data: Buffer | null;
  /** The brand's real website (technical SEO audit follow-up) — what
   * src/seo/audit.ts actually fetches. NULL until the team sets one. */
  site_url: string | null;
  created_at: Date;
}

/**
 * What a pillar is FOR (migration 019). The generation prompt optimises for
 * credibility over lead-gen, which is right for most pillars and wrong for the
 * ones that exist to convert — this is how a pillar says which it is, instead
 * of the whole product picking one answer for all of them.
 */
export type PillarIntent = "authority" | "conversion";

export interface Pillar {
  id: number;
  brand_id: number;
  name: string;
  description: string | null;
  active: boolean;
  intent: PillarIntent;
  /** Where a 'conversion' pillar should point the reader. NULL on 'authority'
   * pillars, and ignored if set there. */
  conversion_target: string | null;
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
  /** The idea this per-channel job belongs to (migration 015). NULL only for
   * rows predating the campaign entity that the backfill couldn't group. */
  campaign_id: number | null;
  /** When generation was claimed (migration 017) — lets a stalled `drafting`
   * topic be told apart from one that just started. NULL unless drafting. */
  drafting_started_at: Date | null;
  created_at: Date;
}

/**
 * One content idea, spanning however many channels it's published to
 * (migration 015). A `topics` row is one channel's job within a campaign —
 * the idea-level fields live here, the per-channel ones stay on the topic.
 */
export interface Campaign {
  id: number;
  brand_id: number;
  title: string;
  pillar_id: number | null;
  source: TopicSource | null;
  why_now: string | null;
  must_say: string | null;
  source_asset_id: number | null;
  created_by: string | null;
  created_at: Date;
}

/** A campaign plus the per-channel state of each of its topics. */
export interface CampaignWithChannels extends Campaign {
  channels: {
    topicId: number;
    platform: string;
    status: TopicStatus;
    draftId: number | null;
    draftStatus: DraftStatus | null;
  }[];
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
  /** What the AI originally wrote (migration 020). Written once at creation and
   * never updated, so an approve-with-edits no longer destroys the reference
   * half of every eval case. Equal to `body` until a human edits. */
  ai_body: string | null;
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

/**
 * One frozen AI-vs-human example (migration 020) — the AI's text and the text
 * a person was actually willing to publish. Nobody authors these; they fall
 * out of the team approving drafts with edits.
 */
export interface EvalCase {
  id: number;
  brand_id: number;
  source_draft_id: number | null;
  topic_id: number | null;
  platform: string;
  angle: string | null;
  ai_body: string;
  human_body: string;
  prompt_version: string | null;
  edit_distance: number | null;
  added_by: string;
  created_at: Date;
}

/** One scored replay of the golden set against one prompt version. */
export interface EvalRun {
  id: number;
  brand_id: number;
  prompt_version: string;
  cases_run: number;
  /** Higher is better — the replay landed closer to the human's version. */
  mean_similarity: number | null;
  /** Lower is better — less rewriting needed. */
  mean_edit_distance: number | null;
  detail: unknown;
  ran_by: string;
  ran_at: Date;
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
  /** Every generated image for this draft, in creation order (LinkedIn
   * multi-image follow-up) — media_asset_id above stays the "cover" image
   * for back-compat; this is the full set, always an array (empty if none). */
  media_asset_ids: number[];
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
  /** The UTM campaign actually stamped onto this post's own links at publish
   * (migration 018). NULL when the body carried no own-domain link to stamp —
   * so a NULL here means "not attributable", never "attributed zero". */
  utm_campaign: string | null;
}

/**
 * A recorded business result (migration 018) — the thing the platform is
 * actually judged on. `post_id` NULL means the brand got these leads in this
 * week without them being attributable to a single post, which is the honest
 * and common case.
 */
export interface Outcome {
  id: number;
  brand_id: number;
  post_id: number | null;
  period_start: string;
  leads: number;
  signups: number;
  source: "manual" | "analytics" | "crm";
  note: string | null;
  recorded_by: string;
  created_at: Date;
}

/**
 * The team's own before/after estimate of what one post costs in time
 * (migration 018). Both figures are human estimates and every surface that
 * uses them says so — the platform supplies only the post count, which it can
 * actually measure.
 */
export interface TimeBaseline {
  id: number;
  brand_id: number;
  minutes_per_post_before: number;
  minutes_per_post_after: number;
  note: string | null;
  recorded_by: string;
  captured_at: Date;
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

/** A real question genuinely sent to an AI answer engine to check whether
 * this brand gets cited in the response (GEO citation-tracking follow-up) —
 * distinct from the "geo" content platform, which writes for these engines
 * but never checked whether it worked. */
export interface GeoProbeQuery {
  id: number;
  brand_id: number;
  query_text: string;
  active: boolean;
  created_at: Date;
}

/** The real, logged result of actually sending one probe query to one AI
 * engine — never a synthesized/estimated score. */
export interface GeoCitationCheck {
  id: number;
  brand_id: number;
  probe_query_id: number;
  engine: string;
  mentioned: boolean;
  response_excerpt: string;
  model_used: string;
  checked_at: Date;
}

/** One real, rule-based technical SEO check against the site's actual HTML —
 * never an estimated/synthesized result (technical SEO audit follow-up). */
export interface SeoCheck {
  label: string;
  pass: boolean;
  detail: string;
  /** Plain-language instruction for a human to apply — nothing auto-applies. */
  fix: string | null;
}

export interface SeoAudit {
  id: number;
  brand_id: number;
  url: string;
  score: number; // 0-100, percentage of checks passed
  checks: SeoCheck[];
  created_at: Date;
}

/** A real search Reddit is genuinely queried for (Reddit community-engagement
 * follow-up) — manual, like competitor tracking, not auto-generated. */
export interface RedditSearchTerm {
  id: number;
  brand_id: number;
  term: string;
  subreddit: string | null;
  active: boolean;
  created_at: Date;
}

export type RedditOpportunityStatus = "new" | "drafted" | "posted" | "dismissed";

/** A real public Reddit thread found via search — never invented. The
 * suggested reply (when drafted) is a human-reviewed starting point, copied
 * out and posted manually; nothing auto-posts. */
export interface RedditOpportunity {
  id: number;
  brand_id: number;
  search_term_id: number | null;
  subreddit: string;
  thread_title: string;
  thread_url: string;
  thread_excerpt: string | null;
  suggested_reply: string | null;
  status: RedditOpportunityStatus;
  created_at: Date;
}
