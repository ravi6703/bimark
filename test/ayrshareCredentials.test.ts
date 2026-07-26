import { afterEach, describe, expect, it, vi } from "vitest";
import { AyrsharePublisher } from "../src/publish/ayrshare.js";

/**
 * Per-brand publish credentials (multi-brand support follow-up) — verifies
 * AyrsharePublisher actually sends a brand's override API key / Profile-Key
 * instead of always the shared default, since a header-building mistake here
 * would silently post through the wrong brand's connected accounts.
 */
describe("AyrsharePublisher per-brand credential overrides", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the shared API key and no Profile-Key when no override is given", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, opts: { headers: Record<string, string> }) => {
        calls.push({ url, headers: opts.headers });
        return new Response(JSON.stringify({ id: "p1", postIds: [] }), { status: 200 });
      }),
    );
    const pub = new AyrsharePublisher("shared-key");
    await pub.publish({ platform: "linkedin", text: "hello" });

    expect(calls[0]!.headers.authorization).toBe("Bearer shared-key");
    expect(calls[0]!.headers["Profile-Key"]).toBeUndefined();
  });

  it("uses a brand's override API key and Profile-Key when provided", async () => {
    const calls: { headers: Record<string, string> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, opts: { headers: Record<string, string> }) => {
        calls.push({ headers: opts.headers });
        return new Response(JSON.stringify({ id: "p2", postIds: [] }), { status: 200 });
      }),
    );
    const pub = new AyrsharePublisher("shared-key");
    await pub.publish({
      platform: "linkedin",
      text: "hello",
      apiKeyOverride: "leadup-key",
      profileKey: "leadup-profile",
    });

    expect(calls[0]!.headers.authorization).toBe("Bearer leadup-key");
    expect(calls[0]!.headers["Profile-Key"]).toBe("leadup-profile");
  });

  it("fetchMetrics also applies the override when passed", async () => {
    const calls: { headers: Record<string, string> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, opts: { headers: Record<string, string> }) => {
        calls.push({ headers: opts.headers });
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );
    const pub = new AyrsharePublisher("shared-key");
    await pub.fetchMetrics("ext-1", { profileKey: "infylearn-profile" });

    expect(calls[0]!.headers.authorization).toBe("Bearer shared-key");
    expect(calls[0]!.headers["Profile-Key"]).toBe("infylearn-profile");
  });
});
