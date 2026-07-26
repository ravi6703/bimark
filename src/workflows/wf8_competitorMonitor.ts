import { logger } from "../logger.js";
import { competitorNotes } from "../db/repositories/index.js";
import { fetchNewsMentions } from "../competitors/newsMonitor.js";

/** Marks a competitor_notes row as machine-generated (vs. a teammate's manual
 * entry) — CompetitorsView tags these differently in the dashboard. */
export const AUTO_MONITOR_AUTHOR = "auto-monitor";

/**
 * WF-8 · Competitor news-mention monitor (Okara-inspired follow-up). For each
 * tracked competitor, pulls recent news mentions and logs any not already
 * recorded — the buildable half of "properly scraped" competitor
 * intelligence (see src/competitors/newsMonitor.ts for why social-media
 * scraping and website-URL guessing are deliberately out of scope here).
 */
export async function runCompetitorMonitor(
  brandId: number,
  trackedCompetitors: string[],
): Promise<{ checked: number; added: number }> {
  const existing = await competitorNotes.list(brandId);
  const seenUrls = new Set(existing.map((n) => n.source_url).filter(Boolean));

  let added = 0;
  for (const competitor of trackedCompetitors) {
    const mentions = await fetchNewsMentions(competitor);
    for (const m of mentions) {
      if (seenUrls.has(m.link)) continue;
      await competitorNotes.create({
        brand_id: brandId,
        competitor_name: competitor,
        source_url: m.link,
        summary: m.title,
        added_by: AUTO_MONITOR_AUTHOR,
      });
      seenUrls.add(m.link);
      added++;
    }
  }

  logger.info({ brandId, competitors: trackedCompetitors.length, added }, "WF-8: competitor monitor run");
  return { checked: trackedCompetitors.length, added };
}
