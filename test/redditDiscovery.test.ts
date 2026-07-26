import { describe, expect, it } from "vitest";
import { parseRedditListing } from "../src/reddit/discovery.js";

describe("parseRedditListing (Reddit community-engagement agent)", () => {
  it("extracts subreddit/title/absolute url/excerpt from each child", () => {
    const listing = {
      data: {
        children: [
          {
            data: {
              title: "What's the best campus hiring assessment platform?",
              selftext: "Looking for recommendations for our 2026 campus drive.",
              permalink: "/r/humanresources/comments/abc123/best_platform/",
              subreddit: "humanresources",
            },
          },
        ],
      },
    };
    const threads = parseRedditListing(listing);
    expect(threads).toEqual([
      {
        subreddit: "humanresources",
        title: "What's the best campus hiring assessment platform?",
        url: "https://www.reddit.com/r/humanresources/comments/abc123/best_platform/",
        excerpt: "Looking for recommendations for our 2026 campus drive.",
      },
    ]);
  });

  it("returns null excerpt for a link post with no selftext", () => {
    const listing = {
      data: {
        children: [
          { data: { title: "A link post", selftext: "", permalink: "/r/x/comments/1/y/", subreddit: "x" } },
        ],
      },
    };
    expect(parseRedditListing(listing)[0]!.excerpt).toBeNull();
  });

  it("truncates a very long selftext to 400 characters", () => {
    const long = "a".repeat(1000);
    const listing = {
      data: { children: [{ data: { title: "t", selftext: long, permalink: "/r/x/comments/1/y/", subreddit: "x" } }] },
    };
    expect(parseRedditListing(listing)[0]!.excerpt).toHaveLength(400);
  });

  it("returns an empty array for an empty or malformed listing", () => {
    expect(parseRedditListing({})).toEqual([]);
    expect(parseRedditListing({ data: {} })).toEqual([]);
    expect(parseRedditListing({ data: { children: [] } })).toEqual([]);
  });

  it("filters out entries with no permalink", () => {
    const listing = {
      data: {
        children: [{ data: { title: "t", selftext: "", permalink: "", subreddit: "x" } }],
      },
    };
    expect(parseRedditListing(listing)).toEqual([]);
  });
});
