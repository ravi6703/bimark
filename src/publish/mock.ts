import { createHash } from "node:crypto";
import type { PostMetrics, PublishRequest, PublishResult, Publisher } from "./types.js";

/**
 * Offline publisher: records the "publish" deterministically without any network
 * call, so the whole approval→publish→metrics loop is exercised in dev and tests.
 * Metrics are a deterministic function of the external id (stable across polls,
 * loosely growing with the poll count passed via the id suffix is not modelled —
 * a fixed snapshot is enough to prove the poller wiring).
 */
export class MockPublisher implements Publisher {
  readonly name = "mock";

  async publish(req: PublishRequest): Promise<PublishResult> {
    const externalId = `mock_${createHash("sha1").update(req.text).digest("hex").slice(0, 12)}`;
    const now = new Date();
    const scheduled = req.scheduledAt ?? null;
    return {
      externalId,
      url: `https://example.test/${req.platform}/${externalId}`,
      scheduledAt: scheduled,
      publishedAt: scheduled ? null : now,
    };
  }

  async fetchMetrics(externalId: string): Promise<PostMetrics | null> {
    const seed = parseInt(externalId.replace(/\D/g, "").slice(0, 6) || "0", 10);
    const r = (mult: number) => (seed % (mult * 7)) + mult;
    return {
      impressions: r(200),
      engagements: r(20),
      clicks: r(5),
      saves: r(3),
      shares: r(2),
      comments: r(1),
    };
  }
}
