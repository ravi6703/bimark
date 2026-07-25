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
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
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
  model_used: string | null;
  prompt_version: string | null;
  reviewer_result: ReviewerResult | null;
  review_retries: number;
  status: string;
  created_at: string;
  topic_angle: string | null;
  pillar_name: string | null;
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
  voice_guide: string | null;
  visual_notes: string | null;
  banned_topics: string[] | null;
}
export interface QualityStats {
  firstPassApprovalRate: number | null;
  meanEditDistance: number | null;
  sample: number;
  target: number;
}

// ── API calls ─────────────────────────────────────────────────────────────
export const api = {
  async login(password: string): Promise<string> {
    const { token } = await request<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    return token;
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

  async listPillars(): Promise<Pillar[]> {
    const { pillars } = await request<{ pillars: Pillar[] }>("/pillars");
    return pillars;
  },

  async getBrand(): Promise<Brand> {
    const { brand } = await request<{ brand: Brand }>("/brand");
    return brand;
  },

  async getQuality(): Promise<QualityStats> {
    return request<QualityStats>("/metrics/quality");
  },

  async approveDraft(id: number, opts: { editedText?: string; mediaUrls?: string[] } = {}) {
    return request(`/drafts/${id}/action`, {
      method: "POST",
      body: JSON.stringify({ decision: "approve", ...opts }),
    });
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
  }): Promise<{ platform: string; topicId: number; draftId: number }[]> {
    const { results } = await request<{
      results: { platform: string; topicId: number; draftId: number }[];
    }>("/webhooks/manual-intake", {
      method: "POST",
      body: JSON.stringify({ brand_id: 1, ...input }),
    });
    return results;
  },
};
