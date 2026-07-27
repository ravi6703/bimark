import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type ClarifyQuestion, type Pillar, type PlatformDetails } from "../api";

const PLATFORMS = [
  { key: "linkedin", label: "LinkedIn" },
  { key: "x", label: "X" },
  { key: "instagram", label: "Instagram" },
  { key: "geo", label: "GEO (AI answer engines)" },
  { key: "youtube", label: "YouTube (script)" },
];

export function NewTopicForm() {
  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [topic, setTopic] = useState("");
  const [pillar, setPillar] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(["linkedin"]);
  const [mustSay, setMustSay] = useState("");
  const [whyNow, setWhyNow] = useState("");

  // Per-platform fields (§20) — one platform's block is expanded at a time.
  const [openPlatform, setOpenPlatform] = useState<string | null>("linkedin");
  const [linkedinAudience, setLinkedinAudience] = useState("");
  const [linkedinCta, setLinkedinCta] = useState("");
  const [xAngleStyle, setXAngleStyle] = useState<"" | "hot-take" | "informative" | "question">("");
  const [instagramVisualStyle, setInstagramVisualStyle] = useState<
    "" | "photography" | "illustration" | "infographic"
  >("");
  const [geoTargetQuestion, setGeoTargetQuestion] = useState("");
  const [youtubeVideoAngle, setYoutubeVideoAngle] = useState<
    "" | "tutorial" | "explainer" | "interview-clip"
  >("");

  // Clarify step (§20) — the AI asks 1-2 questions when the topic is thin.
  const [questions, setQuestions] = useState<ClarifyQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Per-platform generation state — each platform is now its own request, so
  // they finish independently and the operator can watch them land one by one
  // instead of staring at a single spinner for the whole batch.
  const [progress, setProgress] = useState<Record<string, "working" | "done" | "failed"> | null>(null);

  // Previous data for the open platform's pillar (Okara-inspired follow-up,
  // "show previous data") — what's already been said, so a new topic doesn't
  // just repeat it. Same recent-angles lookup that also feeds the prompt.
  const [recentAngles, setRecentAngles] = useState<{ angle: string; status: string }[] | null>(null);
  const [recentLoading, setRecentLoading] = useState(false);

  useEffect(() => {
    api.listPillars().then(setPillars).catch(() => {});
  }, []);

  useEffect(() => {
    if (!openPlatform) {
      setRecentAngles(null);
      return;
    }
    setRecentLoading(true);
    api
      .getRecentTopics(openPlatform, pillar || undefined)
      .then(setRecentAngles)
      .catch(() => setRecentAngles(null))
      .finally(() => setRecentLoading(false));
  }, [openPlatform, pillar]);

  function togglePlatform(key: string) {
    const has = platforms.includes(key);
    if (has) {
      setPlatforms((prev) => prev.filter((p) => p !== key));
      setOpenPlatform((op) => (op === key ? null : op));
    } else {
      setPlatforms((prev) => [...prev, key]);
      setOpenPlatform(key);
    }
  }

  function platformSummary(key: string): string {
    if (key === "linkedin") {
      const parts = [];
      if (linkedinAudience) parts.push(`Audience: ${linkedinAudience}`);
      if (linkedinCta) parts.push(`CTA: ${linkedinCta}`);
      return parts.length ? parts.join(" · ") : "Using default audience & CTA";
    }
    if (key === "x") {
      return xAngleStyle ? `Angle: ${xAngleStyle}` : "Letting the system pick the angle";
    }
    if (key === "instagram") {
      return instagramVisualStyle
        ? `Visual: ${instagramVisualStyle}`
        : "Letting the system pick the visual style";
    }
    if (key === "geo") {
      return geoTargetQuestion ? `Answers: "${geoTargetQuestion}"` : "No target question set yet";
    }
    if (key === "youtube") {
      return youtubeVideoAngle ? `Angle: ${youtubeVideoAngle}` : "Letting the system pick the angle";
    }
    return "";
  }

  function buildPlatformDetails(): PlatformDetails {
    const details: PlatformDetails = {};
    if (platforms.includes("linkedin") && (linkedinAudience || linkedinCta)) {
      details.linkedin = {
        audience: linkedinAudience || undefined,
        cta: linkedinCta || undefined,
      };
    }
    if (platforms.includes("x") && xAngleStyle) {
      details.x = { angleStyle: xAngleStyle };
    }
    if (platforms.includes("instagram") && instagramVisualStyle) {
      details.instagram = { visualStyle: instagramVisualStyle };
    }
    if (platforms.includes("geo") && geoTargetQuestion) {
      details.geo = { targetQuestion: geoTargetQuestion };
    }
    if (platforms.includes("youtube") && youtubeVideoAngle) {
      details.youtube = { videoAngle: youtubeVideoAngle };
    }
    return details;
  }

  function resetForm() {
    setTopic("");
    setMustSay("");
    setWhyNow("");
    setLinkedinAudience("");
    setLinkedinCta("");
    setXAngleStyle("");
    setInstagramVisualStyle("");
    setGeoTargetQuestion("");
    setYoutubeVideoAngle("");
    setQuestions(null);
    setAnswers({});
  }

  async function generate(extraMustSay: string) {
    setSubmitting(true);
    setProgress(null);
    try {
      // Two phases: queue every platform (fast), then generate each one in its
      // own request, in parallel. Generation is tens of seconds per platform,
      // so doing them all in a single request used to hit the serverless
      // timeout as soon as more than a couple of platforms were selected.
      const queued = await api.createTopic({
        topic: topic.trim(),
        pillar: pillar || undefined,
        platforms,
        must_say: [mustSay, extraMustSay].filter(Boolean).join(" ") || undefined,
        why_now: whyNow || undefined,
        platformDetails: buildPlatformDetails(),
      });

      setProgress(Object.fromEntries(queued.map((q) => [q.platform, "working" as const])));
      resetForm();

      const outcomes = await Promise.all(
        queued.map(async (q) => {
          try {
            await api.generateDraft(q.topicId);
            setProgress((p) => ({ ...p, [q.platform]: "done" }));
            return true;
          } catch {
            // Left queued on the server — the drain cron retries it shortly,
            // so this is "not yet", not "lost".
            setProgress((p) => ({ ...p, [q.platform]: "failed" }));
            return false;
          }
        }),
      );

      const ok = outcomes.filter(Boolean).length;
      setSuccess(
        ok === queued.length
          ? `${ok} draft${ok > 1 ? "s" : ""} ready in the review queue.`
          : `${ok} of ${queued.length} drafts ready. The rest are still queued and will be retried automatically.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!topic.trim()) {
      setError("Enter a topic.");
      return;
    }
    if (platforms.length === 0) {
      setError("Pick at least one platform.");
      return;
    }
    setSubmitting(true);
    try {
      const clarify = await api.clarifyTopic({
        topic: topic.trim(),
        platforms,
        must_say: mustSay || undefined,
        why_now: whyNow || undefined,
      });
      if (clarify.sufficient) {
        await generate("");
      } else {
        setQuestions(clarify.questions);
        setSubmitting(false);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit");
      setSubmitting(false);
    }
  }

  async function handleAnswerSubmit(e: FormEvent) {
    e.preventDefault();
    const extra = (questions ?? [])
      .map((q, i) => (answers[i]?.trim() ? `${q.question} ${answers[i]!.trim()}` : ""))
      .filter(Boolean)
      .join(" ");
    await generate(extra);
  }

  if (questions) {
    return (
      <form className="card" onSubmit={handleAnswerSubmit}>
        <p className="pillar-tag" style={{ marginBottom: 10 }}>
          A couple of quick questions before drafting — this keeps the post specific instead of generic.
        </p>
        {questions.map((q, i) => (
          <div key={i}>
            <label htmlFor={`q-${i}`}>
              [{q.platform}] {q.question}
            </label>
            <input
              id={`q-${i}`}
              type="text"
              value={answers[i] ?? ""}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
            />
          </div>
        ))}

        {error && <div className="error-box" style={{ marginTop: 14 }}>{error}</div>}

        <div className="row">
          <button className="btn primary" type="submit" disabled={submitting}>
            {submitting ? "Generating…" : "Generate draft(s)"}
          </button>
          <button
            className="btn"
            type="button"
            disabled={submitting}
            onClick={() => generate("")}
          >
            Skip — generate anyway
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <label>Platforms — check all that should get a draft, then tap one to customize it</label>
      <div className="checkbox-row">
        {PLATFORMS.map((p) => (
          <label key={p.key}>
            <input
              type="checkbox"
              checked={platforms.includes(p.key)}
              onChange={() => togglePlatform(p.key)}
            />
            {p.label}
          </label>
        ))}
      </div>

      {platforms.length > 0 && (
        <div className="platform-accordion">
          {PLATFORMS.filter((p) => platforms.includes(p.key)).map((p) => {
            const isOpen = openPlatform === p.key;
            return (
              <div className={`accordion-item ${isOpen ? "open" : ""}`} key={p.key}>
                <button
                  type="button"
                  className="accordion-header"
                  aria-expanded={isOpen}
                  aria-controls={`accordion-panel-${p.key}`}
                  id={`accordion-header-${p.key}`}
                  onClick={() => setOpenPlatform(isOpen ? null : p.key)}
                >
                  <span className="accordion-chevron">{isOpen ? "▾" : "▸"}</span>
                  <span className="accordion-label">{p.label}</span>
                  {!isOpen && <span className="accordion-summary">{platformSummary(p.key)}</span>}
                </button>

                {isOpen && (
                  <div
                    className="accordion-body"
                    id={`accordion-panel-${p.key}`}
                    role="region"
                    aria-labelledby={`accordion-header-${p.key}`}
                  >
                    <div className="recent-angles-box">
                      <div className="recent-angles-label">
                        Previously covered{pillar ? ` — ${pillar} / ${p.label}` : ` — ${p.label}`}
                      </div>
                      {recentLoading && <span className="pillar-tag">Loading…</span>}
                      {!recentLoading && recentAngles != null && recentAngles.length === 0 && (
                        <span className="pillar-tag">Nothing yet — this'll be the first.</span>
                      )}
                      {!recentLoading && recentAngles != null && recentAngles.length > 0 && (
                        <ul>
                          {recentAngles.map((r, i) => (
                            <li key={i}>{r.angle}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {p.key === "linkedin" && (
                      <>
                        <label htmlFor="li-audience">Target audience (optional)</label>
                        <input
                          id="li-audience"
                          type="text"
                          value={linkedinAudience}
                          onChange={(e) => setLinkedinAudience(e.target.value)}
                          placeholder="e.g. senior HR leaders, placement officers"
                        />
                        <label htmlFor="li-cta">Call to action (optional)</label>
                        <input
                          id="li-cta"
                          type="text"
                          value={linkedinCta}
                          onChange={(e) => setLinkedinCta(e.target.value)}
                          placeholder="e.g. ask readers to share their view"
                        />
                      </>
                    )}

                    {p.key === "x" && (
                      <>
                        <label htmlFor="x-angle">Angle style (optional)</label>
                        <select
                          id="x-angle"
                          value={xAngleStyle}
                          onChange={(e) => setXAngleStyle(e.target.value as typeof xAngleStyle)}
                        >
                          <option value="">Let the system pick</option>
                          <option value="hot-take">Hot take — provocative, opinionated</option>
                          <option value="informative">Informative — straight insight</option>
                          <option value="question">Question — put it to the audience</option>
                        </select>
                      </>
                    )}

                    {p.key === "instagram" && (
                      <>
                        <label htmlFor="ig-visual">Visual style (optional)</label>
                        <select
                          id="ig-visual"
                          value={instagramVisualStyle}
                          onChange={(e) =>
                            setInstagramVisualStyle(e.target.value as typeof instagramVisualStyle)
                          }
                        >
                          <option value="">Let the system pick</option>
                          <option value="photography">Photography — realistic scene</option>
                          <option value="illustration">Illustration — minimal, drawn</option>
                          <option value="infographic">Infographic — chart/data visual</option>
                        </select>
                        <div className="pillar-tag" style={{ marginTop: 6 }}>
                          🖼️ Instagram drafts get an AI-generated image attached automatically — no
                          manual upload.
                        </div>
                      </>
                    )}

                    {p.key === "geo" && (
                      <>
                        <label htmlFor="geo-question">Question this piece should directly answer</label>
                        <input
                          id="geo-question"
                          type="text"
                          value={geoTargetQuestion}
                          onChange={(e) => setGeoTargetQuestion(e.target.value)}
                          placeholder="e.g. What is skills-based hiring?"
                        />
                        <div className="pillar-tag" style={{ marginTop: 6 }}>
                          ✨ Written to be found and cited by AI answer engines (ChatGPT, Perplexity),
                          not posted to a social feed — there's no auto-publish for this, you'll copy
                          it into your own site/CMS after approval.
                        </div>
                      </>
                    )}

                    {p.key === "youtube" && (
                      <>
                        <label htmlFor="yt-angle">Video angle (optional)</label>
                        <select
                          id="yt-angle"
                          value={youtubeVideoAngle}
                          onChange={(e) => setYoutubeVideoAngle(e.target.value as typeof youtubeVideoAngle)}
                        >
                          <option value="">Let the system pick</option>
                          <option value="tutorial">Tutorial — step-by-step, actionable</option>
                          <option value="explainer">Explainer — builds understanding of a concept</option>
                          <option value="interview-clip">Interview clip — short, talking-points style</option>
                        </select>
                        <div className="pillar-tag" style={{ marginTop: 6 }}>
                          🎬 There's no video-generation pipeline — this produces a script/outline
                          (title, hook, talking points, CTA) for a human to shoot and upload.
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <label htmlFor="topic">Topic</label>
      <textarea
        id="topic"
        placeholder="e.g. the skills gap in tier-2 engineering colleges"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        rows={3}
      />

      <label htmlFor="pillar">Pillar (optional — auto-picked if left blank)</label>
      <select id="pillar" value={pillar} onChange={(e) => setPillar(e.target.value)}>
        <option value="">Let the system pick</option>
        {pillars.map((p) => (
          <option key={p.id} value={p.name}>
            {p.name}
          </option>
        ))}
      </select>

      <label htmlFor="mustsay">Must-say points (optional)</label>
      <input
        id="mustsay"
        type="text"
        value={mustSay}
        onChange={(e) => setMustSay(e.target.value)}
        placeholder="anything that must be included"
      />

      <label htmlFor="whynow">Why now? (optional)</label>
      <input
        id="whynow"
        type="text"
        value={whyNow}
        onChange={(e) => setWhyNow(e.target.value)}
        placeholder="what makes this timely"
      />

      {error && <div className="error-box" style={{ marginTop: 14 }}>{error}</div>}

      {progress && (
        <div className="callout-box" style={{ marginTop: 14 }} aria-live="polite">
          {Object.entries(progress).map(([p, state]) => (
            <div key={p} className="pillar-tag" style={{ marginBottom: 2 }}>
              {state === "done" ? "✅" : state === "failed" ? "⏳" : "⋯"} <b>{p}</b>
              {state === "working"
                ? " — generating…"
                : state === "done"
                  ? " — ready for review"
                  : " — still queued, will retry automatically"}
            </div>
          ))}
        </div>
      )}

      {success && <div className="success-box" style={{ marginTop: 14 }}>{success}</div>}

      <div className="row">
        <button className="btn primary" type="submit" disabled={submitting}>
          {submitting ? "Generating…" : "Generate draft(s)"}
        </button>
      </div>
    </form>
  );
}
