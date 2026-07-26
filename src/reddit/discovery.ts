const USER_AGENT = "bimark:reddit-community-agent:v1.0 (by /u/bimark-agent)";
const FETCH_TIMEOUT_MS = 15_000;

export interface RedditThread {
  subreddit: string;
  title: string;
  url: string; // full permalink, absolute
  excerpt: string | null;
}

interface RedditListingChild {
  data: {
    title: string;
    selftext: string;
    permalink: string;
    subreddit: string;
  };
}
interface RedditListing {
  data?: { children?: RedditListingChild[] };
}

/**
 * Reddit community-engagement agent (Okara-comparison follow-up) — searches
 * Reddit's own public, unauthenticated search JSON endpoint (no API key, no
 * scraping of gated pages) for real threads matching a search term. Read-only:
 * this never posts anything. See src/workflows/wf10_redditMonitor.ts for how
 * results get turned into reviewable opportunities, and DraftCard-style
 * copy-and-post-yourself flow (not built here) for how a reply actually goes
 * out.
 */
export async function searchReddit(term: string, subreddit?: string | null): Promise<RedditThread[]> {
  const base = subreddit
    ? `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.json`
    : "https://www.reddit.com/search.json";
  const params = new URLSearchParams({
    q: term,
    sort: "new",
    limit: "10",
    ...(subreddit ? { restrict_sr: "1" } : {}),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${base}?${params.toString()}`, {
      headers: { "user-agent": USER_AGENT },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`Reddit search failed for "${term}": HTTP ${res.status}`);
  }
  const json = (await res.json()) as RedditListing;
  return parseRedditListing(json);
}

/** Pure parsing, exported for testing without a real network fetch. */
export function parseRedditListing(json: RedditListing): RedditThread[] {
  const children = json.data?.children ?? [];
  return children
    .map((c) => c.data)
    .filter((d) => d && d.permalink)
    .map((d) => ({
      subreddit: d.subreddit,
      title: d.title,
      url: `https://www.reddit.com${d.permalink}`,
      excerpt: d.selftext ? d.selftext.slice(0, 400) : null,
    }));
}
