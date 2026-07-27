import { describe, expect, it } from "vitest";
import {
  buildCampaignTag,
  buildUtmParams,
  isOwnDomain,
  stampBodyLinks,
  stampUrl,
} from "../src/publish/utm.js";

const SITE = "https://www.boardinfinity.com";
const P = buildUtmParams({ platform: "linkedin", campaignId: 7, topicId: 99 });

describe("UTM stamping (Move 1 — attribution at publish)", () => {
  it("groups a multi-channel idea under one campaign, keeping the channel separate", () => {
    // The team's first question is "did this idea work", the second is "which
    // channel carried it" — so campaign is idea-scoped, source is per-channel.
    const li = buildUtmParams({ platform: "linkedin", campaignId: 7, topicId: 1 });
    const x = buildUtmParams({ platform: "x", campaignId: 7, topicId: 2 });
    expect(li.campaign).toBe(x.campaign);
    expect(li.source).not.toBe(x.source);
  });

  it("falls back to the topic when a draft predates the campaign entity", () => {
    expect(buildCampaignTag({ campaignId: null, topicId: 42 })).toBe("bimark-t42");
    expect(buildCampaignTag({ campaignId: 3, topicId: 42 })).toBe("bimark-c3");
  });

  it("treats sub-domains as the brand's own, and unrelated hosts as not", () => {
    expect(isOwnDomain("https://boardinfinity.com/x", SITE)).toBe(true);
    expect(isOwnDomain("https://blog.boardinfinity.com/x", SITE)).toBe(true);
    expect(isOwnDomain("https://www.boardinfinity.com/x", SITE)).toBe(true);
    expect(isOwnDomain("https://timesofindia.com/x", SITE)).toBe(false);
    // A look-alike host must not be mistaken for a sub-domain.
    expect(isOwnDomain("https://notboardinfinity.com/x", SITE)).toBe(false);
    expect(isOwnDomain("https://boardinfinity.com.evil.net/x", SITE)).toBe(false);
  });

  it("returns false rather than throwing on unparseable input", () => {
    expect(isOwnDomain("not a url", SITE)).toBe(false);
    expect(isOwnDomain("https://boardinfinity.com", null)).toBe(false);
    expect(stampUrl("not a url", P)).toBe("not a url");
  });

  it("preserves existing query params and never overwrites a human's own tag", () => {
    const out = stampUrl("https://boardinfinity.com/p?ref=deck&utm_source=newsletter", P);
    expect(out).toContain("ref=deck");
    // The human wrote utm_source deliberately; it wins.
    expect(out).toContain("utm_source=newsletter");
    expect(out).not.toContain("utm_source=linkedin");
    expect(out).toContain("utm_campaign=bimark-c7");
  });

  it("is idempotent — re-stamping doesn't double up params", () => {
    const once = stampUrl("https://boardinfinity.com/p", P);
    expect(stampUrl(once, P)).toBe(once);
  });

  it("stamps only the brand's own links, leaving third-party links alone", () => {
    const body =
      "We wrote about this at https://boardinfinity.com/blog/skills and " +
      "the data came from https://timesofindia.com/article/123.";
    const { text, stamped } = stampBodyLinks(body, SITE, P);
    expect(stamped).toBe(1);
    expect(text).toContain("boardinfinity.com/blog/skills?utm_source=linkedin");
    // Somebody else's URL is not ours to rewrite.
    expect(text).toContain("https://timesofindia.com/article/123.");
    expect(text).not.toContain("timesofindia.com/article/123?utm");
  });

  it("keeps sentence punctuation outside the URL", () => {
    const { text } = stampBodyLinks("Read https://boardinfinity.com/p.", SITE, P);
    expect(text).toMatch(/utm_campaign=bimark-c7\.$/);
    expect(text).not.toContain("/p.?");
  });

  it("reports zero stamped when there is nothing to attribute", () => {
    // A post with no own-domain link must not claim attribution — the caller
    // uses this to decide whether to record utm_campaign at all.
    expect(stampBodyLinks("No links here at all.", SITE, P).stamped).toBe(0);
    expect(stampBodyLinks("See https://example.com/x", SITE, P).stamped).toBe(0);
  });

  it("is a no-op for a brand with no site URL set", () => {
    const body = "Read https://boardinfinity.com/p";
    expect(stampBodyLinks(body, null, P)).toEqual({ text: body, stamped: 0 });
  });
});
