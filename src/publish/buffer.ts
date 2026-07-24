import { config } from "../config.js";
import { logger } from "../logger.js";
import type { PostMetrics, PublishRequest, PublishResult, Publisher } from "./types.js";

/**
 * Buffer adapter. Buffer's public API schedules updates against a "profile"
 * (one per connected channel). Metric coverage via Buffer's API is limited, so
 * fetchMetrics is best-effort and returns null when unavailable — the SOV +
 * memo path degrades gracefully.
 *
 * NOTE: Buffer's classic API is being superseded; verify the current endpoint
 * and auth model at build time (§ "[confirm]").
 */
export class BufferPublisher implements Publisher {
  readonly name = "buffer";
  private base = "https://api.bufferapp.com/1";

  constructor(
    private accessToken = config.publish.buffer.accessToken,
    private profileId = config.publish.buffer.profileIdLinkedIn,
  ) {
    if (!accessToken || !profileId) {
      throw new Error("BufferPublisher requires BUFFER_ACCESS_TOKEN and BUFFER_PROFILE_ID_LINKEDIN");
    }
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    const body = new URLSearchParams();
    body.set("profile_ids[]", this.profileId);
    body.set("text", req.text);
    if (req.scheduledAt) body.set("scheduled_at", req.scheduledAt.toISOString());
    else body.set("now", "true");
    for (const url of req.mediaUrls ?? []) body.append("media[photo]", url);

    const res = await fetch(`${this.base}/updates/create.json?access_token=${this.accessToken}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`buffer publish failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as {
      updates?: { id?: string; scheduled_at?: number; status?: string }[];
    };
    const update = json.updates?.[0];
    const scheduledAt = update?.scheduled_at ? new Date(update.scheduled_at * 1000) : null;
    return {
      externalId: update?.id ?? null,
      url: null, // Buffer returns the live URL only after it publishes.
      scheduledAt,
      publishedAt: update?.status === "sent" ? new Date() : null,
    };
  }

  async fetchMetrics(externalId: string): Promise<PostMetrics | null> {
    try {
      const res = await fetch(
        `${this.base}/updates/${externalId}/interactions.json?access_token=${this.accessToken}`,
      );
      if (!res.ok) return null;
      const j = (await res.json()) as Record<string, number>;
      return {
        impressions: j.reach ?? 0,
        engagements: (j.favorites ?? 0) + (j.clicks ?? 0) + (j.comments ?? 0),
        clicks: j.clicks ?? 0,
        saves: j.saves ?? 0,
        shares: j.retweets ?? j.shares ?? 0,
        comments: j.comments ?? 0,
      };
    } catch (err) {
      logger.warn({ err, externalId }, "buffer metrics fetch failed");
      return null;
    }
  }
}
