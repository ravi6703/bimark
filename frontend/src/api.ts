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
}
export interface Brand {
  id: number;
  name: string;
  slug: string;
  voice_guide: string | null;
  visual_notes: string | null;
  banned_topics: string[] | null;
  default_competitors: string[] | null;
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

// ── API calls ─────────────────────────────────────────────────────────────
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
    input: { name?: string; description?: string; active?: boolean },
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

  async updateBrand(input: {
    voice_guide?: string;
    visual_notes?: string;
    banned_topics?: string[];
  }): Promise<Brand> {
    const { brand } = await request<{ brand: Brand }>("/brand", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    return brand;
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

  async createTopic(input: {
    topic: string;
    pillar?: string;
    platforms: string[];
    format?: string;
    must_say?: string;
    why_now?: string;
    platformDetails?: PlatformDetails;
  }): Promise<{ platform: string; topicId: number; draftId: number }[]> {
    const { results } = await request<{
      results: { platform: string; topicId: number; draftId: number }[];
    }>("/webhooks/manual-intake", {
      method: "POST",
      body: JSON.stringify({ brand_id: 1, ...input }),
    });
    return results;
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
