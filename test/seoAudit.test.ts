import { describe, expect, it } from "vitest";
import { auditHtml } from "../src/seo/audit.js";

const GOOD_HTML = `
<!doctype html>
<html>
<head>
  <title>Board Infinity — Skills-Based Hiring Assessments</title>
  <meta name="description" content="Board Infinity helps campus recruitment teams run skills-based hiring assessments at scale, cutting time-to-hire and improving candidate quality.">
  <link rel="canonical" href="https://www.boardinfinity.com/">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta property="og:title" content="Board Infinity">
  <meta property="og:description" content="Skills-based hiring assessments.">
  <meta property="og:image" content="https://www.boardinfinity.com/og.png">
  <script type="application/ld+json">{"@type":"Organization"}</script>
</head>
<body>
  <h1>Skills-based hiring assessments</h1>
  <img src="/a.png" alt="A candidate taking an assessment">
</body>
</html>`;

const BAD_HTML = `
<!doctype html>
<html>
<head><title>Home</title></head>
<body>
  <h1>One</h1>
  <h1>Two</h1>
  <img src="/a.png">
  <img src="/b.png">
</body>
</html>`;

describe("auditHtml (technical SEO audit)", () => {
  it("passes every check for well-formed HTML", () => {
    const checks = auditHtml(GOOD_HTML, "https://www.boardinfinity.com/");
    for (const c of checks) {
      expect(c.pass, `${c.label}: ${c.detail}`).toBe(true);
    }
  });

  it("flags a too-short title, missing description, multiple H1s, and missing alt text", () => {
    const checks = auditHtml(BAD_HTML, "http://example.com/");
    const byLabel = Object.fromEntries(checks.map((c) => [c.label, c]));

    expect(byLabel["Served over HTTPS"]!.pass).toBe(false);
    expect(byLabel["Title tag length"]!.pass).toBe(false);
    expect(byLabel["Meta description length"]!.pass).toBe(false);
    expect(byLabel["Exactly one H1"]!.pass).toBe(false);
    expect(byLabel["Canonical tag present"]!.pass).toBe(false);
    expect(byLabel["Mobile viewport tag present"]!.pass).toBe(false);
    expect(byLabel["Images have alt text"]!.pass).toBe(false);
    expect(byLabel["Structured data (JSON-LD) present"]!.pass).toBe(false);
    expect(byLabel["Open Graph tags present"]!.pass).toBe(false);
  });

  it("every failed check carries a non-null, actionable fix", () => {
    const checks = auditHtml(BAD_HTML, "http://example.com/");
    for (const c of checks.filter((c) => !c.pass)) {
      expect(c.fix, c.label).not.toBeNull();
      expect(c.fix!.length).toBeGreaterThan(0);
    }
  });

  it("treats a page with no images as passing the alt-text check", () => {
    const checks = auditHtml("<html><head><title>x</title></head><body>no images</body></html>", "https://x.com");
    const alt = checks.find((c) => c.label === "Images have alt text")!;
    expect(alt.pass).toBe(true);
  });
});
