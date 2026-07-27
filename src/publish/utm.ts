/**
 * UTM stamping at publish time (Move 1 — make the goal measurable).
 *
 * The platform's stated definition of success is inbound and leads, and until
 * now nothing connected a published post to a visit. Impressions were the only
 * thing recorded. Stamping the brand's own links on the way out is the smallest
 * change that makes bimark's contribution separable from the rest of the site's
 * traffic in whatever analytics tool the team already has — no vendor, no cost.
 *
 * Two deliberate restrictions:
 *
 * 1. Only the brand's OWN domain is stamped. A post citing a Times of India
 *    article or a LinkedIn profile gets left exactly as written — appending
 *    tracking params to somebody else's URL is both useless (we can't read
 *    their analytics) and rude (it rewrites a link the reviewer approved).
 *    The brand's domain comes from brands.site_url, so a brand that hasn't set
 *    one simply gets no stamping rather than a wrong guess.
 *
 * 2. Existing query params are preserved, and an existing utm_* is never
 *    overwritten. If a human deliberately wrote a tagged link into the draft,
 *    their tag wins.
 */

export interface UtmParams {
  source: string;
  medium: string;
  campaign: string;
}

/** Non-URL trailing characters that are almost always sentence punctuation
 * rather than part of the link — "see boardinfinity.com/x." shouldn't stamp
 * the full stop into the path. Closing brackets are handled separately so a
 * URL genuinely wrapped in parens survives. */
const TRAILING_PUNCT = /[.,;:!?'"]+$/;

/**
 * The campaign value written onto the post and its links. Campaign-scoped
 * rather than post-scoped so that one idea published to LinkedIn, X, and
 * Instagram rolls up as a single campaign in analytics, with the platform
 * carried separately in utm_source — which is exactly the question the team
 * will want to ask ("did this idea work", then "which channel carried it").
 */
export function buildCampaignTag(input: {
  campaignId: number | null;
  topicId: number;
}): string {
  return input.campaignId != null ? `bimark-c${input.campaignId}` : `bimark-t${input.topicId}`;
}

export function buildUtmParams(input: {
  platform: string;
  campaignId: number | null;
  topicId: number;
}): UtmParams {
  return {
    source: input.platform,
    medium: "social",
    campaign: buildCampaignTag(input),
  };
}

/** Whether `url` points at the same registrable host as the brand's site.
 * Sub-domains count (blog.example.com is still the brand's own property);
 * an unrelated host does not. */
export function isOwnDomain(url: string, siteUrl: string | null | undefined): boolean {
  if (!siteUrl) return false;
  let target: URL;
  let own: URL;
  try {
    target = new URL(url);
    own = new URL(siteUrl);
  } catch {
    return false;
  }
  const t = target.hostname.replace(/^www\./, "").toLowerCase();
  const o = own.hostname.replace(/^www\./, "").toLowerCase();
  return t === o || t.endsWith(`.${o}`);
}

/**
 * Add the UTM params to a single URL. Idempotent: a param that is already
 * present is left alone, so re-stamping a link never doubles it up and never
 * overrides a tag a human wrote deliberately.
 */
export function stampUrl(url: string, params: UtmParams): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  const pairs: [string, string][] = [
    ["utm_source", params.source],
    ["utm_medium", params.medium],
    ["utm_campaign", params.campaign],
  ];
  for (const [k, v] of pairs) {
    if (!u.searchParams.has(k)) u.searchParams.set(k, v);
  }
  return u.toString();
}

/**
 * Rewrite every own-domain link in the post body. Returns the new text plus
 * how many links were actually stamped, so the caller can record `utm_campaign`
 * on the post only when a link genuinely carries it — a post with no stamped
 * link should not claim attribution it can't deliver.
 */
export function stampBodyLinks(
  body: string,
  siteUrl: string | null | undefined,
  params: UtmParams,
): { text: string; stamped: number } {
  if (!siteUrl || !body) return { text: body, stamped: 0 };

  let stamped = 0;
  const text = body.replace(/https?:\/\/[^\s<>()[\]]+[^\s<>()[\].,;:!?'"]|https?:\/\/[^\s<>()[\]]+/g,
    (match) => {
      // Strip sentence punctuation the regex may have swept up, stamp the real
      // URL, then put the punctuation back.
      const trailing = match.match(TRAILING_PUNCT)?.[0] ?? "";
      const bare = trailing ? match.slice(0, -trailing.length) : match;
      if (!isOwnDomain(bare, siteUrl)) return match;
      const next = stampUrl(bare, params);
      if (next !== bare) stamped += 1;
      return next + trailing;
    });

  return { text, stamped };
}
