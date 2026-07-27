/** Thin fetch client for the dashboard API. Token lives in localStorage. */

const TOKEN_KEY = "bimark_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Selected brand workspace (multi-brand support) — Board Infinity runs
 * several distinct brand lines (Leadup Universe, InfyLearn, Elearning
 * Solutions, alongside Board Infinity's own). Sent as x-brand-id on every
 * request so the API knows which brand's data to read/write.
 */
const BRAND_KEY = "bimark_brand_slug";

export function getSelectedBrandSlug(): string | null {
  return localStorage.getItem(BRAND_KEY);
}
export function setSelectedBrandSlug(slug: string): void {
  localStorage.setItem(BRAND_KEY, slug);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const brandSlug = getSelectedBrandSlug();
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(brandSlug ? { "x-brand-id": brandSlug } : {}),
      ...opts.headers,
    },
  });
  if (res.status === 401) {
    clearToken();
    throw new ApiError(401, "Session expired — please log in again.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof json.error === "string" ? json.error : `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return json as T;
}

// ── Domain types (mirror src/types.ts, kept minimal for the UI) ─────────────
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
  /** Every generated image for this draft, in order (LinkedIn multi-image
   * follow-up) — media_asset_id above is just the first/"cover" one. */
  media_asset_ids: number[];
  model_used: string | null;
  prompt_version: string | null;
  reviewer_result: ReviewerResult | null;
  review_retries: number;
  status: string;
  created_at: string;
  topic_angle: string | null;
  pillar_name: string | null;
  repetitive: boolean;
  similar_to_draft_id: number | null;
  geo_readiness?: { score: number; checks: { label: string; pass: boolean }[] };
  /** Rationale fields (Okara-inspired follow-up) — why this draft exists at all. */
  topic_why_now: string | null;
  topic_source: string | null;
  topic_format_hint: string | null;
  topic_platform_extra: PlatformDetails[keyof PlatformDetails] | null;
}
export interface Topic {
  id: number;
  source: string;
  pillar_id: number | null;
  angle: string | null;
  why_now: string | null;
  platform: string;
  priority: number;
  status: string;
  pitch_group: string | null;
  created_at: string;
}
export interface Pillar {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  /** What this pillar is FOR (Move 4). 'authority' posts never carry a call to
   * action; 'conversion' posts offer exactly one, plainly, at the end. */
  intent: "authority" | "conversion";
  conversion_target: string | null;
}
export interface Brand {
  id: number;
  name: string;
  slug: string;
  voice_guide: string | null;
  visual_notes: string | null;
  banned_topics: string[] | null;
  default_competitors: string[] | null;
  /** Whether this brand has its own publish credentials configured — the
   * secret values themselves never round-trip to the browser (multi-brand
   * support follow-up); PATCH /api/brand is write-only for them. */
  has_ayrshare_api_key: boolean;
  has_ayrshare_profile_key: boolean;
  /** Whether a real logo has been uploaded for this brand — used to
   * watermark generated LinkedIn/Instagram images. The bytes themselves are
   * served from GET /api/brand/logo?brandId=, never inlined here. */
  has_logo: boolean;
  /** The brand's real website — what the technical SEO audit fetches. */
  site_url: string | null;
}
export interface QualityStats {
  firstPassApprovalRate: number | null;
  meanEditDistance: number | null;
  sample: number;
  target: number;
  postsLast7Days: number;
  postsPerWeekMin: number;
  postsPerWeekMax: number;
}
export interface Insight {
  id: number;
  period: string;
  memo: string;
  created_at: string;
}
export interface ApprovalEntry {
  id: number;
  approver: string;
  action: "approve" | "edit" | "reject" | "publish";
  reason: string | null;
  edit_distance: number | null;
  created_at: string;
}
export interface PostItem {
  id: number;
  draft_id: number;
  platform: string;
  url: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  body: string | null;
  media_asset_id: number | null;
  pillar_name: string | null;
}

// ── Per-platform guidance (§20) ──────────────────────────────────────────────
export interface PlatformDetails {
  linkedin?: { audience?: string; cta?: string };
  x?: { angleStyle?: "hot-take" | "informative" | "question" };
  instagram?: { visualStyle?: "photography" | "illustration" | "infographic" };
  /** GEO (generative-engine optimization) — no publish API exists for this; see DraftCard. */
  geo?: { targetQuestion?: string };
  /** YouTube — a script/outline, no video pipeline, no publish API; see DraftCard. */
  youtube?: { videoAngle?: "tutorial" | "explainer" | "interview-clip" };
}
/** AI-derived onboarding proposal (Okara-inspired) — see OnboardingPanel. */
export interface OnboardingProposal {
  voiceGuide: string;
  visualNotes: string;
  bannedTopics: string[];
  pillars: { name: string; description: string }[];
}
export interface ClarifyQuestion {
  platform: string;
  question: string;
}
export interface TeamMember {
  id: number;
  name: string;
  active: boolean;
  created_at: string;
}

/** Competitor intelligence log (Okara-inspired follow-up). */
export interface CompetitorNote {
  id: number;
  competitor_name: string;
  source_url: string | null;
  summary: string;
  learning: string | null;
  added_by: string;
  created_at: string;
}
export interface CompetitorGroup {
  name: string;
  notes: CompetitorNote[];
  sovScore: number | null;
}

/** GEO citation tracking (Okara-comparison follow-up) — real questions sent
 * to a configured AI engine, checked for whether this brand's name shows up. */
export interface GeoProbeQuery {
  id: number;
  query_text: string;
  active: boolean;
  created_at: string;
}
export interface GeoCitationSummary {
  engine: string;
  checked: number;
  mentioned: number;
}
export interface GeoCitationCheck {
  id: number;
  probe_query_id: number;
  engine: string;
  mentioned: boolean;
  response_excerpt: string;
  model_used: string;
  checked_at: string;
}

/**
 * One content idea and the live state of every channel it went out on
 * (migration 015). Replaces listing raw topics, where an idea targeting five
 * platforms showed up five times with nothing tying the rows together.
 */
export interface Campaign {
  id: number;
  title: string;
  pillar_id: number | null;
  source: string | null;
  why_now: string | null;
  must_say: string | null;
  created_by: string | null;
  created_at: string;
  channels: {
    topicId: number;
    platform: string;
    status: string;
    draftId: number | null;
    draftStatus: string | null;
  }[];
}

/** One entry in the agent feed — what an agent found or drafted. */
export interface FeedItem {
  kind: "draft" | "pitch" | "competitor" | "reddit" | "geo" | "seo" | "memo";
  at: string;
  title: string;
  detail: string | null;
  actionable: boolean;
  tab: string;
}

/** One channel's live state — what's waiting, how the week's output compares
 * to its configured cadence, and lifetime published. */
export interface ChannelStatus {
  platform: string;
  label: string;
  autoPublish: boolean;
  /** null when this brand has never set a cadence for the channel. */
  weeklyTarget: number | null;
  active: boolean;
  postsThisWeek: number;
  publishedTotal: number;
  pendingReview: number;
}

/** Technical SEO audit (Okara-comparison follow-up) — real, rule-based
 * checks against the brand's actual site, not an estimated score. */
export interface SeoCheck {
  label: string;
  pass: boolean;
  detail: string;
  fix: string | null;
}
export interface SeoAudit {
  id: number;
  url: string;
  score: number;
  checks: SeoCheck[];
  created_at: string;
}

/** Reddit community-engagement agent (Okara-comparison follow-up) —
 * draft-only: real threads, a drafted reply to review, copy, and post
 * yourself. Nothing here is ever auto-posted. */
export interface RedditSearchTerm {
  id: number;
  term: string;
  subreddit: string | null;
  active: boolean;
  created_at: string;
}
export type RedditOpportunityStatus = "new" | "drafted" | "posted" | "dismissed";
export interface RedditOpportunity {
  id: number;
  search_term_id: number | null;
  subreddit: string;
  thread_title: string;
  thread_url: string;
  thread_excerpt: string | null;
  suggested_reply: string | null;
  status: RedditOpportunityStatus;
  created_at: string;
}

// ── API calls ─────────────────────────────────────────────────────────────

// ── Results & measurement (Moves 1, 2, 5, 6) ───────────────────────────────
export interface CadenceLine {
  platform: string;
  published: number;
  target: number | null;
}
export type ScoreboardHours =
  | { configured: false; reason: string }
  | {
      configured: true;
      postsCounted: number;
      minutesPerPostBefore: number;
      minutesPerPostAfter: number;
      hoursSaved: number;
      capturedAt: string;
      estimateBased: true;
    };
export interface Scoreboard {
  weekStart: string;
  cadence: { published: number; target: number | null; byPlatform: CadenceLine[] };
  queue: {
    firstPassApprovalRate: number | null;
    medianHoursToDecision: number | null;
    awaitingReview: number;
    sample: number;
  };
  hours: ScoreboardHours;
  inbound: {
    leads: number;
    signups: number;
    entries: number;
    attributablePosts: number;
    totalPosts: number;
  };
}
export interface Outcome {
  id: number;
  post_id: number | null;
  period_start: string;
  leads: number;
  signups: number;
  source: string;
  note: string | null;
  recorded_by: string;
  created_at: string;
}
export interface TimeBaseline {
  id: number;
  minutes_per_post_before: number;
  minutes_per_post_after: number;
  note: string | null;
  recorded_by: string;
  captured_at: string;
}
export interface ReadinessCheck {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  fix: string | null;
  blocking: boolean;
}
export interface BrandReadiness {
  brandId: number;
  level: "ready" | "partial" | "empty";
  passed: number;
  total: number;
  checks: ReadinessCheck[];
  blockingReason: string | null;
}
export interface PromptVersionStats {
  promptVersion: string;
  decided: number;
  firstPassApprovalRate: number;
  rejectRate: number;
  meanEditDistance: number | null;
  flagRate: number;
  repetitiveRate: number;
  firstSeen: string;
  lastSeen: string;
}
export interface EvalCaseSummary {
  id: number;
  platform: string;
  angle: string | null;
  prompt_version: string | null;
  edit_distance: number | null;
  added_by: string;
  created_at: string;
}
export interface EvalRun {
  id: number;
  prompt_version: string;
  cases_run: number;
  mean_similarity: number | null;
  mean_edit_distance: number | null;
  ran_by: string;
  ran_at: string;
}

export const api = {
  async login(name: string, password: string): Promise<string> {
    const { token } = await request<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ name, password }),
    });
    return token;
  },

  async listTeammates(): Promise<TeamMember[]> {
    const { users } = await request<{ users: TeamMember[] }>("/auth/users");
    return users;
  },

  async addTeammate(name: string, password: string): Promise<TeamMember> {
    const { user } = await request<{ user: TeamMember }>("/auth/users", {
      method: "POST",
      body: JSON.stringify({ name, password }),
    });
    return user;
  },

  async listDrafts(status = "pending_approval"): Promise<Draft[]> {
    const { drafts } = await request<{ drafts: Draft[] }>(
      `/drafts?status=${encodeURIComponent(status)}`,
    );
    return drafts;
  },

  async listTopics(status?: string): Promise<Topic[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    const { topics } = await request<{ topics: Topic[] }>(`/topics${qs}`);
    return topics;
  },

  async listPillars(opts: { all?: boolean } = {}): Promise<Pillar[]> {
    const qs = opts.all ? "?all=true" : "";
    const { pillars } = await request<{ pillars: Pillar[] }>(`/pillars${qs}`);
    return pillars;
  },

  async createPillar(input: { name: string; description?: string }): Promise<Pillar> {
    const { pillar } = await request<{ pillar: Pillar }>("/pillars", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return pillar;
  },

  async updatePillar(
    id: number,
    input: {
      name?: string;
      description?: string;
      active?: boolean;
      intent?: "authority" | "conversion";
      conversion_target?: string | null;
    },
  ): Promise<Pillar> {
    const { pillar } = await request<{ pillar: Pillar }>(`/pillars/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    return pillar;
  },

  async getBrand(): Promise<Brand> {
    const { brand } = await request<{ brand: Brand }>("/brand");
    return brand;
  },

  /** Every brand workspace (multi-brand support) — for the brand switcher. */
  async listBrands(): Promise<Brand[]> {
    const { brands } = await request<{ brands: Brand[] }>("/brands");
    return brands;
  },

  /**
   * Same numbers OverviewView shows for the selected brand, but for an
   * explicit brand regardless of which one is currently selected — the
   * portfolio rollup (founder-facing) needs all brands side by side, not
   * one switcher click at a time. Overrides x-brand-id per call rather than
   * touching the stored selection, so it can't race the brand switcher.
   */
  async getBrandSummary(brandSlug: string): Promise<{
    pendingCount: number;
    postsLast7Days: number;
    postsPerWeekMin: number;
    postsPerWeekMax: number;
    firstPassApprovalRate: number | null;
    autoMentions: number;
    sovConfigured: boolean;
  }> {
    const headers = { "x-brand-id": brandSlug };
    const [draftsRes, quality, competitorsRes] = await Promise.all([
      request<{ drafts: Draft[] }>("/drafts?status=pending_approval", { headers }),
      request<QualityStats>("/metrics/quality", { headers }),
      request<{ competitors: CompetitorGroup[]; sovConfigured: boolean }>("/competitors", { headers }),
    ]);
    return {
      pendingCount: draftsRes.drafts.length,
      postsLast7Days: quality.postsLast7Days,
      postsPerWeekMin: quality.postsPerWeekMin,
      postsPerWeekMax: quality.postsPerWeekMax,
      firstPassApprovalRate: quality.firstPassApprovalRate,
      autoMentions: competitorsRes.competitors
        .flatMap((g) => g.notes)
        .filter((n) => n.added_by === "auto-monitor").length,
      sovConfigured: competitorsRes.sovConfigured,
    };
  },

  async updateBrand(input: {
    voice_guide?: string;
    visual_notes?: string;
    banned_topics?: string[];
    ayrshare_api_key?: string;
    ayrshare_profile_key?: string;
    site_url?: string;
  }): Promise<Brand> {
    const { brand } = await request<{ brand: Brand }>("/brand", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    return brand;
  },

  /** Public URL for the selected brand's logo — only meaningful if has_logo. */
  brandLogoUrl(brandId: number): string {
    return `/api/brand/logo?brandId=${brandId}`;
  },

  async uploadBrandLogo(file: { data: string; mime_type: string }): Promise<void> {
    await request("/brand/logo", { method: "POST", body: JSON.stringify(file) });
  },

  async deleteBrandLogo(): Promise<void> {
    await request("/brand/logo", { method: "DELETE" });
  },

  async getQuality(): Promise<QualityStats> {
    return request<QualityStats>("/metrics/quality");
  },

  async listInsights(): Promise<{ insights: Insight[]; sovConfigured: boolean }> {
    return request<{ insights: Insight[]; sovConfigured: boolean }>("/insights");
  },

  async regenerateImage(draftId: number) {
    return request(`/drafts/${draftId}/regenerate-image`, { method: "POST" });
  },

  async getDraftActivity(draftId: number): Promise<ApprovalEntry[]> {
    const { activity } = await request<{ activity: ApprovalEntry[] }>(`/drafts/${draftId}/activity`);
    return activity;
  },

  async listPosts(range: { from: string; to: string }): Promise<PostItem[]> {
    const qs = new URLSearchParams(range).toString();
    const { posts } = await request<{ posts: PostItem[] }>(`/posts?${qs}`);
    return posts;
  },

  async approveDraft(
    id: number,
    opts: { editedText?: string; mediaUrls?: string[]; scheduledAt?: string; hold?: boolean } = {},
  ) {
    return request(`/drafts/${id}/action`, {
      method: "POST",
      body: JSON.stringify({ decision: "approve", ...opts }),
    });
  },

  /** Manual publish for a draft approved with hold: true (§20). */
  async publishHeldDraft(id: number) {
    return request(`/drafts/${id}/publish`, { method: "POST" });
  },

  /** GEO's equivalent of publishHeldDraft — no platform API, just recordkeeping. */
  async markPosted(id: number) {
    return request(`/drafts/${id}/mark-posted`, { method: "POST" });
  },

  async proposeOnboarding(url: string, pageText?: string): Promise<OnboardingProposal> {
    const { proposal } = await request<{ proposal: OnboardingProposal }>("/onboarding/propose", {
      method: "POST",
      body: JSON.stringify({ url, pageText }),
    });
    return proposal;
  },

  async rejectDraft(id: number, reason?: string) {
    return request(`/drafts/${id}/action`, {
      method: "POST",
      body: JSON.stringify({ decision: "reject", reason }),
    });
  },

  /**
   * Queues one topic per selected platform and returns straight away — this
   * does NOT wait for drafts. Generating every platform in one request used to
   * blow past the 60s serverless cap; call generateDraft() per returned topic
   * instead (they can run in parallel).
   */
  async createTopic(input: {
    topic: string;
    pillar?: string;
    platforms: string[];
    format?: string;
    must_say?: string;
    why_now?: string;
    platformDetails?: PlatformDetails;
  }): Promise<{ campaignId: number; queued: { platform: string; topicId: number }[] }> {
    return request("/webhooks/manual-intake", {
      method: "POST",
      body: JSON.stringify({ brand_id: 1, ...input }),
    });
  },

  /** The agent feed — everything the agents found or drafted, newest first. */
  async getFeed(): Promise<FeedItem[]> {
    const { items } = await request<{ items: FeedItem[] }>("/feed");
    return items;
  },

  async listChannels(): Promise<ChannelStatus[]> {
    const { channels } = await request<{ channels: ChannelStatus[] }>("/channels");
    return channels;
  },

  /** Set a channel's weekly cadence — this drives which channel the morning
   * pitch targets, so it has to be settable from the dashboard. */
  async updateChannel(
    platform: string,
    patch: { weekly_target?: number; active?: boolean },
  ): Promise<void> {
    await request("/channels", {
      method: "PATCH",
      body: JSON.stringify({ platform, ...patch }),
    });
  },

  /** Content ideas with each channel's live state (migration 015). */
  async listCampaigns(): Promise<Campaign[]> {
    const { campaigns } = await request<{ campaigns: Campaign[] }>("/campaigns");
    return campaigns;
  },

  /** Generate the draft for one queued topic. Safe to retry — a failed
   * generation releases the topic back to the queue. */
  async generateDraft(topicId: number): Promise<{ platform: string; draftId: number }> {
    return request("/topics/generate", {
      method: "POST",
      body: JSON.stringify({ topicId }),
    });
  },

  /** Recent angles already covered for this pillar+platform (Okara-inspired follow-up). */
  async getRecentTopics(
    platform: string,
    pillar?: string,
  ): Promise<{ angle: string; created_at: string; status: string }[]> {
    const qs = new URLSearchParams({ platform, ...(pillar ? { pillar } : {}) }).toString();
    const { recent } = await request<{ recent: { angle: string; created_at: string; status: string }[] }>(
      `/topics/recent?${qs}`,
    );
    return recent;
  },

  async listCompetitors(): Promise<{
    competitors: CompetitorGroup[];
    sovConfigured: boolean;
    sovCapturedAt: string | null;
  }> {
    return request("/competitors");
  },

  async addCompetitorNote(input: {
    competitor_name: string;
    summary: string;
    learning?: string;
    source_url?: string;
  }): Promise<CompetitorNote> {
    const { note } = await request<{ note: CompetitorNote }>("/competitors", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return note;
  },

  async deleteCompetitorNote(id: number) {
    return request(`/competitors/${id}`, { method: "DELETE" });
  },

  /** Manual "check for new mentions now" (Okara-inspired follow-up) — the
   * same news-mention check the weekly cron runs, for the selected brand. */
  async checkCompetitorMentions(): Promise<{ checked: number; added: number }> {
    return request("/competitors/monitor", { method: "POST" });
  },

  async listGeoProbeQueries(): Promise<GeoProbeQuery[]> {
    const { queries } = await request<{ queries: GeoProbeQuery[] }>("/geo/probe-queries");
    return queries;
  },

  async addGeoProbeQuery(queryText: string): Promise<GeoProbeQuery> {
    const { query } = await request<{ query: GeoProbeQuery }>("/geo/probe-queries", {
      method: "POST",
      body: JSON.stringify({ query_text: queryText }),
    });
    return query;
  },

  async deleteGeoProbeQuery(id: number) {
    return request(`/geo/probe-queries/${id}`, { method: "DELETE" });
  },

  async getGeoCitations(): Promise<{
    configured: boolean;
    summary: GeoCitationSummary[];
    recent: GeoCitationCheck[];
  }> {
    return request("/geo/citations");
  },

  /** Manual "check citation now" — the same check the weekly cron runs. */
  async checkGeoCitationsNow(): Promise<{ checked: number }> {
    return request("/geo/citations/check-now", { method: "POST" });
  },

  async getSeoAudits(): Promise<{ siteUrl: string | null; audits: SeoAudit[] }> {
    return request("/seo/audits");
  },

  /** Genuinely fetches the live site right now — not cached/estimated. */
  async runSeoAudit(url?: string): Promise<SeoAudit> {
    const { audit } = await request<{ audit: SeoAudit }>("/seo/audits/run", {
      method: "POST",
      body: JSON.stringify(url ? { url } : {}),
    });
    return audit;
  },

  async listRedditSearchTerms(): Promise<RedditSearchTerm[]> {
    const { terms } = await request<{ terms: RedditSearchTerm[] }>("/reddit/search-terms");
    return terms;
  },

  async addRedditSearchTerm(term: string, subreddit?: string): Promise<RedditSearchTerm> {
    const { term: created } = await request<{ term: RedditSearchTerm }>("/reddit/search-terms", {
      method: "POST",
      body: JSON.stringify({ term, subreddit: subreddit || undefined }),
    });
    return created;
  },

  async deleteRedditSearchTerm(id: number) {
    return request(`/reddit/search-terms/${id}`, { method: "DELETE" });
  },

  async listRedditOpportunities(): Promise<RedditOpportunity[]> {
    const { opportunities } = await request<{ opportunities: RedditOpportunity[] }>("/reddit/opportunities");
    return opportunities;
  },

  /** Manual "find new threads now" — the same search the weekly cron runs. */
  async checkRedditNow(): Promise<{ checked: number; added: number }> {
    return request("/reddit/opportunities/check-now", { method: "POST" });
  },

  async draftRedditReply(id: number): Promise<RedditOpportunity> {
    const { opportunity } = await request<{ opportunity: RedditOpportunity }>(
      `/reddit/opportunities/${id}/draft-reply`,
      { method: "POST" },
    );
    return opportunity;
  },

  async markRedditPosted(id: number): Promise<RedditOpportunity> {
    const { opportunity } = await request<{ opportunity: RedditOpportunity }>(
      `/reddit/opportunities/${id}/mark-posted`,
      { method: "POST" },
    );
    return opportunity;
  },

  async dismissRedditOpportunity(id: number): Promise<RedditOpportunity> {
    const { opportunity } = await request<{ opportunity: RedditOpportunity }>(
      `/reddit/opportunities/${id}/dismiss`,
      { method: "POST" },
    );
    return opportunity;
  },

  // ── Results & measurement (Moves 1, 2, 5, 6) ─────────────────────────────
  async getScoreboard(): Promise<Scoreboard> {
    const { scoreboard } = await request<{ scoreboard: Scoreboard }>("/scoreboard");
    return scoreboard;
  },

  async listOutcomes(): Promise<Outcome[]> {
    const { outcomes } = await request<{ outcomes: Outcome[] }>("/outcomes");
    return outcomes;
  },

  async recordOutcome(input: {
    leads: number;
    signups?: number;
    period_start?: string;
    source?: string;
    note?: string;
  }): Promise<Outcome> {
    const { outcome } = await request<{ outcome: Outcome }>("/outcomes", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return outcome;
  },

  async deleteOutcome(id: number): Promise<void> {
    await request(`/outcomes/${id}`, { method: "DELETE" });
  },

  async getTimeBaseline(): Promise<TimeBaseline | null> {
    const { baseline } = await request<{ baseline: TimeBaseline | null }>("/time-baseline");
    return baseline;
  },

  async recordTimeBaseline(input: {
    minutes_per_post_before: number;
    minutes_per_post_after: number;
    note?: string;
  }): Promise<TimeBaseline> {
    const { baseline } = await request<{ baseline: TimeBaseline }>("/time-baseline", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return baseline;
  },

  async getReadiness(): Promise<BrandReadiness> {
    const { readiness } = await request<{ readiness: BrandReadiness }>("/brands/readiness");
    return readiness;
  },

  async getAllReadiness(): Promise<BrandReadiness[]> {
    const { readiness } = await request<{ readiness: BrandReadiness[] }>(
      "/brands/readiness?all=true",
    );
    return readiness;
  },

  async getEval(): Promise<{
    currentPromptVersion: string;
    report: PromptVersionStats[];
    cases: EvalCaseSummary[];
    runs: EvalRun[];
  }> {
    return request("/eval");
  },

  async harvestEvalCases(): Promise<{ added: number; skipped: number }> {
    return request("/eval/harvest", { method: "POST" });
  },

  async runEval(): Promise<{ run: EvalRun; remaining: number }> {
    return request("/eval/run", { method: "POST" });
  },

  async clarifyTopic(input: {
    topic: string;
    platforms: string[];
    must_say?: string;
    why_now?: string;
  }): Promise<{ sufficient: boolean; questions: ClarifyQuestion[] }> {
    return request("/topics/clarify", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};
