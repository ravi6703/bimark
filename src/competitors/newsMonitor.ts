/**
 * Competitor news-mention monitoring (Okara-inspired follow-up — the
 * "properly scraped" half of competitor intelligence that's actually
 * buildable without a paid vendor). Uses Google News' public RSS search
 * feed — no API key, no scraping of gated/ToS-restricted pages, just a
 * public RSS endpoint keyed off the competitor's own name.
 *
 * Deliberately does NOT attempt social-media scraping (LinkedIn/Instagram
 * scraping violates their ToS and has no usable public API) or guess at a
 * competitor's website URL (inventing a domain we haven't verified is
 * exactly the kind of fabrication this project avoids elsewhere) — see
 * src/competitors/group.ts and the Competitors dashboard copy for the
 * honesty posture this follows.
 */

export interface NewsMention {
  title: string;
  link: string;
  pubDate: string | null;
}

const GOOGLE_NEWS_RSS = "https://news.google.com/rss/search";

/** Pulls the text between two XML tags, undecoded — Google's feed doesn't
 * nest tags of the same name inside <item>, so a simple slice is reliable
 * without pulling in a full XML parser dependency. */
function tagText(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!match) return null;
  return match[1]!
    .replace("<![CDATA[", "")
    .replace("]]>", "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

/** Parses the <item> blocks out of a Google News RSS response. Pure — no
 * network — so it's unit-testable against a fixture string. */
export function parseNewsRss(xml: string, limit = 3): NewsMention[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items.slice(0, limit).map((item) => ({
    title: tagText(item, "title") ?? "(untitled)",
    link: tagText(item, "link") ?? "",
    pubDate: tagText(item, "pubDate"),
  }));
}

/**
 * Fetches recent news mentions of a competitor by name. Best-effort: a
 * network/parse failure returns an empty list rather than throwing, so one
 * competitor's fetch failing doesn't stop the rest of the monitoring run.
 */
export async function fetchNewsMentions(competitorName: string, limit = 3): Promise<NewsMention[]> {
  try {
    const url = `${GOOGLE_NEWS_RSS}?q=${encodeURIComponent(`"${competitorName}"`)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const xml = await res.text();
    return parseNewsRss(xml, limit).filter((m) => m.link);
  } catch {
    return [];
  }
}
