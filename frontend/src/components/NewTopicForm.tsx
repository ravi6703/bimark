import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type ClarifyQuestion, type Pillar, type PlatformDetails } from "../api";

const PLATFORMS = [
  { key: "linkedin", label: "LinkedIn" },
  { key: "x", label: "X" },
  { key: "instagram", label: "Instagram" },
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

  // Clarify step (§20) — the AI asks 1-2 questions when the topic is thin.
  const [questions, setQuestions] = useState<ClarifyQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    api.listPillars().then(setPillars).catch(() => {});
  }, []);

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
    setQuestions(null);
    setAnswers({});
  }

  async function generate(extraMustSay: string) {
    setSubmitting(true);
    try {
      const results = await api.createTopic({
        topic: topic.trim(),
        pillar: pillar || undefined,
        platforms,
        must_say: [mustSay, extraMustSay].filter(Boolean).join(" ") || undefined,
        why_now: whyNow || undefined,
        platformDetails: buildPlatformDetails(),
      });
      setSuccess(
        `Queued ${results.length} draft${results.length > 1 ? "s" : ""} for review: ` +
          results.map((r) => r.platform).join(", "),
      );
      resetForm();
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
                  onClick={() => setOpenPlatform(isOpen ? null : p.key)}
                >
                  <span className="accordion-chevron">{isOpen ? "▾" : "▸"}</span>
                  <span className="accordion-label">{p.label}</span>
                  {!isOpen && <span className="accordion-summary">{platformSummary(p.key)}</span>}
                </button>

                {isOpen && (
                  <div className="accordion-body">
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
      {success && <div className="success-box" style={{ marginTop: 14 }}>{success}</div>}

      <div className="row">
        <button className="btn primary" type="submit" disabled={submitting}>
          {submitting ? "Checking…" : "Generate draft(s)"}
        </button>
      </div>
    </form>
  );
}
