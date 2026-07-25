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

  // Per-platform fields (§20) — only the checked platform's fields matter.
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
    setPlatforms((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
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

  const includesInstagram = platforms.includes("instagram");

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
      <label>Platforms — one draft is generated per platform, each with platform-native copy</label>
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

      {platforms.includes("linkedin") && (
        <div className="platform-fields">
          <label htmlFor="li-audience">LinkedIn — target audience (optional)</label>
          <input
            id="li-audience"
            type="text"
            value={linkedinAudience}
            onChange={(e) => setLinkedinAudience(e.target.value)}
            placeholder="e.g. senior HR leaders, placement officers"
          />
          <label htmlFor="li-cta">LinkedIn — call to action (optional)</label>
          <input
            id="li-cta"
            type="text"
            value={linkedinCta}
            onChange={(e) => setLinkedinCta(e.target.value)}
            placeholder="e.g. ask readers to share their view"
          />
        </div>
      )}

      {platforms.includes("x") && (
        <div className="platform-fields">
          <label htmlFor="x-angle">X — angle style (optional)</label>
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
        </div>
      )}

      {includesInstagram && (
        <div className="platform-fields">
          <label htmlFor="ig-visual">Instagram — visual style (optional)</label>
          <select
            id="ig-visual"
            value={instagramVisualStyle}
            onChange={(e) => setInstagramVisualStyle(e.target.value as typeof instagramVisualStyle)}
          >
            <option value="">Let the system pick</option>
            <option value="photography">Photography — realistic scene</option>
            <option value="illustration">Illustration — minimal, drawn</option>
            <option value="infographic">Infographic — chart/data visual</option>
          </select>
          <div className="pillar-tag" style={{ marginTop: 6 }}>
            🖼️ Instagram drafts get an AI-generated image attached automatically — no manual upload.
          </div>
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
