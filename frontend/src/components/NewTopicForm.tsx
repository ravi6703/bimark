import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type Pillar } from "../api";

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    api.listPillars().then(setPillars).catch(() => {});
  }, []);

  function togglePlatform(key: string) {
    setPlatforms((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key],
    );
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
      const results = await api.createTopic({
        topic: topic.trim(),
        pillar: pillar || undefined,
        platforms,
        must_say: mustSay || undefined,
        why_now: whyNow || undefined,
      });
      setSuccess(
        `Queued ${results.length} draft${results.length > 1 ? "s" : ""} for review: ` +
          results.map((r) => r.platform).join(", "),
      );
      setTopic("");
      setMustSay("");
      setWhyNow("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  const includesInstagram = platforms.includes("instagram");

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
      {includesInstagram && (
        <div className="pillar-tag" style={{ marginTop: 6 }}>
          🖼️ Instagram drafts get an AI-generated image attached automatically — no manual upload.
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
          {submitting ? "Generating…" : "Generate draft(s)"}
        </button>
      </div>
    </form>
  );
}
