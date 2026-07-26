import * as cheerio from "cheerio";
import { logger } from "../logger.js";
import type { SeoCheck } from "../types.js";

const USER_AGENT = "Mozilla/5.0 (compatible; bimark-seo-audit/1.0)";
const FETCH_TIMEOUT_MS = 15_000;

async function fetchText(url: string): Promise<{ ok: boolean; status: number; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "user-agent": USER_AGENT }, signal: controller.signal });
    return { ok: res.ok, status: res.status, text: res.ok ? await res.text() : "" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Technical SEO audit agent (Okara-comparison follow-up) — real, rule-based
 * checks against the brand's actual site HTML, robots.txt, and sitemap.xml.
 * Every check here is independently verifiable from the fetched bytes; none
 * of it is estimated or guessed. Explicitly does NOT attempt performance/
 * Core Web Vitals scoring (would need a paid API like PageSpeed Insights) or
 * auto-apply fixes (would need write access to the site's source — a real
 * decision for the user to make, same class of call as GitHub PR automation).
 */
export async function runSeoAudit(rawUrl: string): Promise<{ url: string; score: number; checks: SeoCheck[] }> {
  const url = normalizeUrl(rawUrl);
  const origin = new URL(url).origin;

  const page = await fetchText(url);
  if (!page.ok) {
    throw new Error(`Could not fetch ${url} (HTTP ${page.status || "no response"}) — check the URL is public and correct.`);
  }
  const checks = auditHtml(page.text, url);

  const [robots, sitemap] = await Promise.all([
    checkAncillaryFile(`${origin}/robots.txt`, "robots.txt", (text) => !/disallow:\s*\/\s*$/im.test(text)),
    checkAncillaryFile(`${origin}/sitemap.xml`, "sitemap.xml", () => true),
  ]);
  checks.push(robots, sitemap);

  const score = Math.round((checks.filter((c) => c.pass).length / checks.length) * 100);
  return { url, score, checks };
}

/** The pure, HTML-only half of the audit — exported for testing without a
 * real network fetch. Runs the checks that don't need robots.txt/sitemap.xml. */
export function auditHtml(html: string, url: string): SeoCheck[] {
  const $ = cheerio.load(html);
  return [
    httpsCheck(url),
    titleCheck($),
    metaDescriptionCheck($),
    h1Check($),
    canonicalCheck($),
    viewportCheck($),
    imageAltCheck($),
    structuredDataCheck($),
    openGraphCheck($),
  ];
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function httpsCheck(url: string): SeoCheck {
  const pass = url.startsWith("https://");
  return {
    label: "Served over HTTPS",
    pass,
    detail: pass ? "Site loads over HTTPS." : "Site is not served over HTTPS.",
    fix: pass ? null : "Set up an SSL certificate and redirect all HTTP traffic to HTTPS.",
  };
}

function titleCheck($: cheerio.CheerioAPI): SeoCheck {
  const title = $("title").first().text().trim();
  const len = title.length;
  const pass = len >= 30 && len <= 60;
  return {
    label: "Title tag length",
    pass,
    detail: title ? `Title is ${len} characters: "${title}"` : "No <title> tag found.",
    fix: pass ? null : "Write a <title> tag between 30 and 60 characters describing the page.",
  };
}

function metaDescriptionCheck($: cheerio.CheerioAPI): SeoCheck {
  const desc = $('meta[name="description"]').attr("content")?.trim() ?? "";
  const len = desc.length;
  const pass = len >= 120 && len <= 160;
  return {
    label: "Meta description length",
    pass,
    detail: desc ? `Meta description is ${len} characters.` : "No meta description found.",
    fix: pass ? null : 'Add a <meta name="description"> tag between 120 and 160 characters.',
  };
}

function h1Check($: cheerio.CheerioAPI): SeoCheck {
  const count = $("h1").length;
  const pass = count === 1;
  return {
    label: "Exactly one H1",
    pass,
    detail: `Found ${count} <h1> tag${count === 1 ? "" : "s"}.`,
    fix: pass ? null : "Use exactly one <h1> per page — it should state what the page is about.",
  };
}

function canonicalCheck($: cheerio.CheerioAPI): SeoCheck {
  const href = $('link[rel="canonical"]').attr("href");
  const pass = !!href;
  return {
    label: "Canonical tag present",
    pass,
    detail: pass ? `Canonical points to ${href}.` : "No <link rel=\"canonical\"> found.",
    fix: pass ? null : 'Add a <link rel="canonical" href="..."> tag pointing at the preferred URL for this page.',
  };
}

function viewportCheck($: cheerio.CheerioAPI): SeoCheck {
  const pass = $('meta[name="viewport"]').length > 0;
  return {
    label: "Mobile viewport tag present",
    pass,
    detail: pass ? "Viewport meta tag found." : "No viewport meta tag found.",
    fix: pass ? null : 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> for mobile.',
  };
}

function imageAltCheck($: cheerio.CheerioAPI): SeoCheck {
  const images = $("img");
  const total = images.length;
  const withAlt = images.filter((_, el) => !!$(el).attr("alt")?.trim()).length;
  const ratio = total === 0 ? 1 : withAlt / total;
  const pass = ratio >= 0.8;
  return {
    label: "Images have alt text",
    pass,
    detail: total === 0 ? "No <img> tags on the page." : `${withAlt} of ${total} images have alt text.`,
    fix: pass ? null : "Add descriptive alt text to images missing it — helps both SEO and accessibility.",
  };
}

function structuredDataCheck($: cheerio.CheerioAPI): SeoCheck {
  const pass = $('script[type="application/ld+json"]').length > 0;
  return {
    label: "Structured data (JSON-LD) present",
    pass,
    detail: pass ? "Found at least one JSON-LD script tag." : "No JSON-LD structured data found.",
    fix: pass
      ? null
      : "Add JSON-LD structured data (e.g. Organization, Article) — helps AI answer engines and search results understand the page.",
  };
}

function openGraphCheck($: cheerio.CheerioAPI): SeoCheck {
  const tags = ["og:title", "og:description", "og:image"];
  const present = tags.filter((t) => !!$(`meta[property="${t}"]`).attr("content"));
  const pass = present.length === tags.length;
  return {
    label: "Open Graph tags present",
    pass,
    detail: `${present.length} of ${tags.length} Open Graph tags found.`,
    fix: pass ? null : `Add the missing Open Graph tags: ${tags.filter((t) => !present.includes(t)).join(", ")}.`,
  };
}

async function checkAncillaryFile(
  url: string,
  label: string,
  contentIsHealthy: (text: string) => boolean,
): Promise<SeoCheck> {
  try {
    const res = await fetchText(url);
    const pass = res.ok && contentIsHealthy(res.text);
    return {
      label: `${label} reachable`,
      pass,
      detail: res.ok
        ? pass
          ? `${label} is reachable and looks fine.`
          : `${label} is reachable but its content looks off (e.g. blocking all crawlers).`
        : `${label} returned HTTP ${res.status}.`,
      fix: pass ? null : `Add or fix ${label} at ${url}.`,
    };
  } catch (err) {
    logger.warn({ err, url }, "seo audit: ancillary file check failed");
    return {
      label: `${label} reachable`,
      pass: false,
      detail: `Could not reach ${label}.`,
      fix: `Add or fix ${label} at ${url}.`,
    };
  }
}
