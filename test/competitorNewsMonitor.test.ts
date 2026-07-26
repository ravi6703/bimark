import { describe, expect, it } from "vitest";
import { parseNewsRss } from "../src/competitors/newsMonitor.js";

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>"Superset" - Google News</title>
<item>
  <title><![CDATA[Superset raises new funding round - TechCrunch]]></title>
  <link>https://news.example.com/superset-funding</link>
  <pubDate>Mon, 20 Jul 2026 10:00:00 GMT</pubDate>
</item>
<item>
  <title><![CDATA[Superset &amp; partners launch new hiring tool]]></title>
  <link>https://news.example.com/superset-launch</link>
  <pubDate>Sun, 19 Jul 2026 08:00:00 GMT</pubDate>
</item>
<item>
  <title><![CDATA[Older Superset mention]]></title>
  <link>https://news.example.com/superset-old</link>
  <pubDate>Fri, 10 Jul 2026 08:00:00 GMT</pubDate>
</item>
<item>
  <title><![CDATA[Even older mention]]></title>
  <link>https://news.example.com/superset-oldest</link>
  <pubDate>Mon, 01 Jul 2026 08:00:00 GMT</pubDate>
</item>
</channel>
</rss>`;

describe("parseNewsRss (competitor news monitoring, Okara-inspired follow-up)", () => {
  it("extracts title/link/pubDate from each <item>", () => {
    const items = parseNewsRss(SAMPLE_RSS, 10);
    expect(items.length).toBe(4);
    expect(items[0]).toEqual({
      title: "Superset raises new funding round - TechCrunch",
      link: "https://news.example.com/superset-funding",
      pubDate: "Mon, 20 Jul 2026 10:00:00 GMT",
    });
  });

  it("decodes HTML entities in titles", () => {
    const items = parseNewsRss(SAMPLE_RSS, 10);
    expect(items[1]!.title).toBe("Superset & partners launch new hiring tool");
  });

  it("respects the limit, keeping the most recent items first", () => {
    const items = parseNewsRss(SAMPLE_RSS, 2);
    expect(items.length).toBe(2);
    expect(items.map((i) => i.link)).toEqual([
      "https://news.example.com/superset-funding",
      "https://news.example.com/superset-launch",
    ]);
  });

  it("returns an empty list for malformed/empty XML", () => {
    expect(parseNewsRss("not xml at all")).toEqual([]);
    expect(parseNewsRss("")).toEqual([]);
  });
});
