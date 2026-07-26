import { config } from "../config.js";
import { logger } from "../logger.js";
import type { PostMetrics, PublishCredentials, PublishRequest, PublishResult, Publisher } from "./types.js";

/**
 * Ayrshare adapter — API-first (§12.3). One key posts to all linked networks;
 * `platforms` selects which. Analytics come back from /analytics/post.
 *
 * Multi-brand support: each call can override the API key and/or pass a
 * Profile-Key (Ayrshare's multi-profile plan) so a brand with its own
 * connected accounts posts through those, not the shared default — see
 * db/migrations/010_brand_publish_credentials.sql.
 */
export class AyrsharePublisher implements Publisher {
  readonly name = "ayrshare";
  private base = "https://app.ayrshare.com/api";

  constructor(private apiKey = config.publish.ayrshare.apiKey) {
    if (!apiKey) throw new Error("AyrsharePublisher requires AYRSHARE_API_KEY");
  }

  private headers(creds?: PublishCredentials) {
    return {
      authorization: `Bearer ${creds?.apiKeyOverride || this.apiKey}`,
      "content-type": "application/json",
      ...(creds?.profileKey ? { "Profile-Key": creds.profileKey } : {}),
    };
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    const ayrsharePlatform = toAyrsharePlatform(req.platform);
    const payload: Record<string, unknown> = {
      post: req.text,
      platforms: [ayrsharePlatform],
    };
    if (req.mediaUrls?.length) payload.mediaUrls = req.mediaUrls;
    if (req.scheduledAt) payload.scheduleDate = req.scheduledAt.toISOString();

    const res = await fetch(`${this.base}/post`, {
      method: "POST",
      headers: this.headers(req),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`ayrshare publish failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as {
      id?: string;
      postIds?: { platform: string; postUrl?: string; id?: string }[];
    };
    const first = json.postIds?.find((p) => p.platform === ayrsharePlatform) ?? json.postIds?.[0];
    return {
      externalId: json.id ?? first?.id ?? null,
      url: first?.postUrl ?? null,
      scheduledAt: req.scheduledAt ?? null,
      publishedAt: req.scheduledAt ? null : new Date(),
    };
  }

  async fetchMetrics(externalId: string, creds?: PublishCredentials): Promise<PostMetrics | null> {
    try {
      const res = await fetch(`${this.base}/analytics/post`, {
        method: "POST",
        headers: this.headers(creds),
        body: JSON.stringify({ id: externalId }),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as Record<string, any>;
      // Ayrshare nests analytics per-platform; flatten the first available.
      const platformData = Object.values(j).find(
        (v) => v && typeof v === "object" && "analytics" in v,
      ) as { analytics?: Record<string, number> } | undefined;
      const a = platformData?.analytics ?? {};
      return {
        impressions: a.impressions ?? a.impressionCount ?? 0,
        engagements: a.engagements ?? a.engagementCount ?? 0,
        clicks: a.clickCount ?? a.clicks ?? 0,
        saves: a.saves ?? 0,
        shares: a.shareCount ?? a.shares ?? 0,
        comments: a.commentCount ?? a.comments ?? 0,
      };
    } catch (err) {
      logger.warn({ err, externalId }, "ayrshare metrics fetch failed");
      return null;
    }
  }
}

/**
 * Our internal platform value is "x" (matches the PRD's naming and the zod
 * enum in wf3_manualIntake.ts); Ayrshare kept "twitter" as the platform
 * identifier in their API even after the X rebrand. Everything else maps
 * 1:1.
 */
function toAyrsharePlatform(platform: string): string {
  if (platform === "geo" || platform === "youtube") {
    // Belt-and-suspenders: WF-5 always routes GEO/YouTube content to the hold
    // state and never calls publishNow() for it, so reaching here means that
    // guard was bypassed somewhere — fail loudly rather than post nonsense to
    // whatever Ayrshare does with an unrecognized platform string.
    throw new Error(`${platform} content has no publish API — this should never reach the publisher`);
  }
  return platform === "x" ? "twitter" : platform;
}
