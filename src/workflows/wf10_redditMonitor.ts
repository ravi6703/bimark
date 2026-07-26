import { logger } from "../logger.js";
import { redditOpportunities, redditSearchTerms } from "../db/repositories/index.js";
import { searchReddit } from "../reddit/discovery.js";

/**
 * WF-10 · Reddit community-engagement discovery (Okara-comparison
 * follow-up). For each of the brand's search terms, finds real public
 * threads and logs any not already recorded — draft-only, same posture as
 * WF-8's competitor news monitor: this discovers and dedups, it never posts.
 */
export async function runRedditMonitor(brandId: number): Promise<{ checked: number; added: number }> {
  const terms = await redditSearchTerms.listActive(brandId);
  if (terms.length === 0) return { checked: 0, added: 0 };

  const existing = await redditOpportunities.list(brandId);
  const seenUrls = new Set(existing.map((o) => o.thread_url));

  let added = 0;
  for (const term of terms) {
    let threads;
    try {
      threads = await searchReddit(term.term, term.subreddit);
    } catch (err) {
      logger.warn({ err, brandId, term: term.term }, "WF-10: reddit search failed for this term");
      continue;
    }
    for (const t of threads) {
      if (seenUrls.has(t.url)) continue;
      await redditOpportunities.create({
        brand_id: brandId,
        search_term_id: term.id,
        subreddit: t.subreddit,
        thread_title: t.title,
        thread_url: t.url,
        thread_excerpt: t.excerpt,
      });
      seenUrls.add(t.url);
      added++;
    }
  }

  logger.info({ brandId, terms: terms.length, added }, "WF-10: reddit monitor run");
  return { checked: terms.length, added };
}
