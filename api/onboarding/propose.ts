import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/requireAuth.js";
import { logger } from "../../src/logger.js";
import { fetchPageText, proposeBrandProfile } from "../../src/agents/onboarding.js";

/**
 * POST /api/onboarding/propose — read a URL, propose a starting brand profile
 * (Okara-inspired). Read-only: nothing is persisted here. The dashboard
 * shows the proposal for review/editing, then applies it via the existing
 * PATCH /api/brand and POST /api/pillars endpoints.
 *
 * Body: { url } to auto-fetch, or { url, pageText } to skip the fetch and
 * analyze pasted text directly — real sites commonly block scraper bots
 * (confirmed against boardinfinity.com itself during development, which
 * 403s automated fetches), so a manual-paste path isn't an edge case.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  const pastedText = typeof req.body?.pageText === "string" ? req.body.pageText.trim() : "";
  if (!/^https?:\/\/.+/i.test(url)) {
    res.status(400).json({ error: "provide a valid http(s) URL" });
    return;
  }

  try {
    const pageText = pastedText || (await fetchPageText(url).catch((err) => {
      throw new Error(
        `Couldn't fetch that page automatically (${err instanceof Error ? err.message : "unknown error"}) — ` +
          "many sites block scraper bots. Paste the page text instead and try again.",
      );
    }));
    const proposal = await proposeBrandProfile({ url, pageText });
    res.status(200).json({ ok: true, proposal });
  } catch (err) {
    logger.error({ err, url }, "onboarding propose failed");
    res.status(400).json({ error: err instanceof Error ? err.message : "failed to analyze that URL" });
  }
}
