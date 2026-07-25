import "dotenv/config";

/**
 * Central, typed configuration. Every integration reads whether it is "live"
 * (real credentials present) or falls back to a deterministic mock, so the app
 * boots and the test suite runs with an empty `.env`.
 */

function str(key: string, fallback = ""): string {
  const v = process.env[key];
  return v === undefined || v === "" ? fallback : v;
}
function int(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}
function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

export type EmbedProvider = "mock" | "openai" | "voyage";
export type PublishProvider = "mock" | "buffer" | "ayrshare";
export type ImageProvider = "mock" | "openai" | "openrouter";

export const config = {
  env: str("NODE_ENV", "development"),
  port: int("PORT", 3000),
  logLevel: str("LOG_LEVEL", "info"),
  tz: str("TZ", "Asia/Kolkata"),

  db: {
    url: str("DATABASE_URL"),
    get enabled() {
      return this.url !== "";
    },
  },

  llm: {
    apiKey: str("ANTHROPIC_API_KEY"),
    modelFast: str("LLM_MODEL_FAST", "claude-haiku-4-5-20251001"),
    modelStrong: str("LLM_MODEL_STRONG", "claude-opus-4-8"),
    get live() {
      return this.apiKey !== "";
    },
  },

  embed: {
    provider: str("EMBED_PROVIDER", "mock") as EmbedProvider,
    model: str("EMBED_MODEL", "text-embedding-3-small"),
    dim: int("EMBED_DIM", 1536),
    apiKey: str("EMBED_API_KEY"),
    baseUrl: str("EMBED_BASE_URL", "https://api.openai.com/v1"),
  },

  telegram: {
    token: str("TELEGRAM_BOT_TOKEN"),
    chatId: str("TELEGRAM_CHAT_ID"),
    secondApproverChatId: str("TELEGRAM_SECOND_APPROVER_CHAT_ID"),
    get live() {
      return this.token !== "" && this.chatId !== "";
    },
  },

  publish: {
    provider: str("PUBLISH_PROVIDER", "mock") as PublishProvider,
    buffer: {
      accessToken: str("BUFFER_ACCESS_TOKEN"),
      profileIdLinkedIn: str("BUFFER_PROFILE_ID_LINKEDIN"),
    },
    ayrshare: {
      apiKey: str("AYRSHARE_API_KEY"),
    },
  },

  image: {
    provider: str("IMAGE_PROVIDER", "openrouter") as ImageProvider,
    model: str("IMAGE_MODEL", "google/gemini-2.5-flash-image"),
    size: str("IMAGE_SIZE", "1024x1024"), // only used by the openai provider
    openrouter: {
      apiKey: str("OPENROUTER_API_KEY"),
    },
    openai: {
      apiKey: str("OPENAI_API_KEY"),
    },
  },

  /** Own origin, for self-hosted media URLs (§20 image gen) that Ayrshare fetches. */
  publicBaseUrl: str(
    "PUBLIC_BASE_URL",
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : `http://localhost:${str("PORT", "3000")}`,
  ),

  cron: {
    morningPitch: str("CRON_MORNING_PITCH", "0 8 * * *"),
    analyticsPoll: str("CRON_ANALYTICS_POLL", "*/30 * * * *"),
    sov: str("CRON_SOV", "0 9 * * 1"),
    editorialMemo: str("CRON_EDITORIAL_MEMO", "0 9 1 * *"),
    ingestRefresh: str("CRON_INGEST_REFRESH", "0 2 * * *"),
  },

  rag: {
    similarityThreshold: num("RAG_SIMILARITY_THRESHOLD", 0.35),
    topK: int("RAG_TOP_K", 6),
    // Distinctiveness guard (audit Phase 3, §1 "95-5 rule / distinctiveness
    // over volume"): how similar a new draft can be to a recently
    // approved/published one on the same platform before it's flagged as a
    // likely repeat. Cosine similarity in embedding space. NOTE: this default
    // was chosen against MockEmbedder's hashed bag-of-words space, which is
    // NOT representative of a real embedder's distribution (per the Tech
    // audit) — re-tune once EMBED_PROVIDER is set to a real provider, the
    // same open item as RAG_SIMILARITY_THRESHOLD itself.
    distinctivenessThreshold: num("RAG_DISTINCTIVENESS_THRESHOLD", 0.93),
    // How far back to compare against — the point is catching "we just said
    // this," not flagging every post that shares a pillar.
    distinctivenessLookbackDays: int("RAG_DISTINCTIVENESS_LOOKBACK_DAYS", 60),
  },

  // Social-listening source for §19 SOV (audit Phase 3). Unset ⇒ NullSovSource
  // (honestly reports "not configured" — see isSovConfigured() — rather than
  // a fabricated 0%). "brand24" activates the real adapter once both
  // BRAND24_API_KEY and BRAND24_PROJECT_MAP are set.
  sov: {
    provider: str("SOV_PROVIDER", "mock"),
    brand24: {
      apiKey: str("BRAND24_API_KEY"),
      // JSON map of tracked entity name -> Brand24 project id/slug, e.g.
      // {"Board Infinity":"<project-slug>","Hurix":"<project-slug>"} — one
      // Brand24 project per brand/competitor, configured in your Brand24
      // account first (see src/sov/brand24.ts for why).
      projectMapJson: str("BRAND24_PROJECT_MAP", "{}"),
    },
  },

  quality: {
    firstPassApprovalTarget: num("FIRST_PASS_APPROVAL_TARGET", 0.7),
    // Max reviewer round-trips before escalating a persistently flagged draft (WF-4.4).
    maxReviewRetries: int("MAX_REVIEW_RETRIES", 2),
    // The PRD's own cadence target (README: "2-4 posts a week, not one a day") —
    // instrumented in the dashboard (audit Phase 1) instead of just asserted in docs.
    postsPerWeekMin: int("POSTS_PER_WEEK_MIN", 2),
    postsPerWeekMax: int("POSTS_PER_WEEK_MAX", 4),
  },

  admin: {
    // Legacy shared secret. No longer the login credential (see the `users`
    // table / named-account auth, audit Phase 0) — kept only (a) as the
    // default token-signing secret below so existing deployments don't need
    // a new env var, and (b) as the one-time bootstrap password that creates
    // the very first named account on first login.
    password: str("ADMIN_PASSWORD"),
    // Signs auth tokens. Independent of any single user's password, so
    // rotating one person's password doesn't invalidate everyone else's
    // session. Falls back to ADMIN_PASSWORD so this isn't a required new var.
    tokenSecret: str("AUTH_TOKEN_SECRET", str("ADMIN_PASSWORD")),
    get enabled() {
      return this.tokenSecret !== "";
    },
  },
} as const;

export type Config = typeof config;
