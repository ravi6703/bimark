import { config } from "../config.js";
import { logger } from "../logger.js";
import type { PostMetrics, PublishRequest, PublishResult, Publisher } from "./types.js";

/**
 * Ayrshare adapter — API-first (§12.3). One key posts to all linked networks;
 * `platforms` selects which. Analytics come back from /analytics/post.
 */
export class AyrsharePublisher implements Publisher {
  readonly name = "ayrshare";
  private base = "https://app.ayrshare.com/api";

  constructor(private apiKey = config.publish.ayrshare.apiKey) {
    if (!apiKey) throw new Error("AyrsharePublisher requires AYRSHARE_API_KEY");
  }

  private headers() {
    return {
      authorization: `Bearer ${this.apiKey}`,
      "content-type": "application/json",
    };
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    const payload: Record<string, unknown> = {
      post: req.text,
      platforms: [req.platform],
    };
    if (req.mediaUrls?.length) payload.mediaUrls = req.mediaUrls;
    if (req.scheduledAt) payload.scheduleDate = req.scheduledAt.toISOString();

    const res = await fetch(`${this.base}/post`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`ayrshare publish failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as {
      id?: string;
      postIds?: { platform: string; postUrl?: string; id?: string }[];
    };
    const first = json.postIds?.find((p) => p.platform === req.platform) ?? json.postIds?.[0];
    return {
      externalId: json.id ?? first?.id ?? null,
      url: first?.postUrl ?? null,
      scheduledAt: req.scheduledAt ?? null,
      publishedAt: req.scheduledAt ? null : new Date(),
    };
  }

  async fetchMetrics(externalId: string): Promise<PostMetrics | null> {
    try {
      const res = await fetch(`${this.base}/analytics/post`, {
        method: "POST",
        headers: this.headers(),
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
