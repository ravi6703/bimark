import { describe, expect, it } from "vitest";
import { MockPublisher } from "../src/publish/mock.js";
import { shouldPoll } from "../src/workflows/wf6_analyticsPoller.js";
import { currentPeriod } from "../src/scheduler.js";

describe("MockPublisher", () => {
  const pub = new MockPublisher();

  it("publishes deterministically and returns a stable external id", async () => {
    const a = await pub.publish({ platform: "linkedin", text: "hello world" });
    const b = await pub.publish({ platform: "linkedin", text: "hello world" });
    expect(a.externalId).toBe(b.externalId);
    expect(a.publishedAt).not.toBeNull(); // published now when unscheduled
  });

  it("marks scheduled posts as not-yet-published", async () => {
    const future = new Date(Date.now() + 3600_000);
    const r = await pub.publish({ platform: "linkedin", text: "later", scheduledAt: future });
    expect(r.scheduledAt).not.toBeNull();
    expect(r.publishedAt).toBeNull();
  });

  it("returns non-negative metrics for a post", async () => {
    const { externalId } = await pub.publish({ platform: "linkedin", text: "metrics" });
    const m = await pub.fetchMetrics(externalId!);
    expect(m).not.toBeNull();
    for (const v of Object.values(m!)) expect(v).toBeGreaterThanOrEqual(0);
  });
});

describe("analytics poller taper (§7.1 / WF-6.4)", () => {
  it("does not poll before a post is live", () => {
    const now = new Date("2026-07-24T10:00:00Z");
    const future = new Date("2026-07-24T11:00:00Z");
    expect(shouldPoll(future, now)).toBe(false);
  });

  it("always polls a fresh post (< 6h old)", () => {
    const now = new Date("2026-07-24T10:00:00Z");
    const published = new Date("2026-07-24T09:00:00Z");
    expect(shouldPoll(published, now)).toBe(true);
  });

  it("polls an old post only on the 6-hourly boundary", () => {
    const published = new Date("2026-07-20T00:00:00Z");
    const onBoundary = new Date("2026-07-24T12:10:00Z"); // hour % 6 === 0, min < 30
    const offBoundary = new Date("2026-07-24T13:10:00Z");
    expect(shouldPoll(published, onBoundary)).toBe(true);
    expect(shouldPoll(published, offBoundary)).toBe(false);
  });
});

describe("editorial memo period", () => {
  it("returns the previous month in YYYY-MM", () => {
    expect(currentPeriod(new Date("2026-07-01T09:00:00Z"))).toBe("2026-06");
    expect(currentPeriod(new Date("2026-01-01T09:00:00Z"))).toBe("2025-12");
  });
});
