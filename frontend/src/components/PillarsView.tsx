import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type Brand, type Pillar } from "../api";
import { OnboardingPanel } from "./OnboardingPanel";

function BrandEditor({ brand, onSaved }: { brand: Brand; onSaved: (b: Brand) => void }) {
  const [voiceGuide, setVoiceGuide] = useState(brand.voice_guide ?? "");
  const [visualNotes, setVisualNotes] = useState(brand.visual_notes ?? "");
  const [bannedTopics, setBannedTopics] = useState((brand.banned_topics ?? []).join(", "));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateBrand({
        voice_guide: voiceGuide,
        visual_notes: visualNotes,
        banned_topics: bannedTopics
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      onSaved(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <strong>{brand.name}</strong>
        {!editing && (
          <button className="btn" style={{ marginLeft: "auto" }} onClick={() => setEditing(true)}>
            ✏️ Edit
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={handleSave}>
          <label htmlFor="voice">Voice guide</label>
          <textarea id="voice" rows={8} value={voiceGuide} onChange={(e) => setVoiceGuide(e.target.value)} />
          <label htmlFor="visual">Visual notes (used for AI image generation)</label>
          <textarea id="visual" rows={3} value={visualNotes} onChange={(e) => setVisualNotes(e.target.value)} />
          <label htmlFor="banned">Banned topics (comma-separated)</label>
          <input id="banned" type="text" value={bannedTopics} onChange={(e) => setBannedTopics(e.target.value)} />
          {error && <div className="error-box" style={{ marginTop: 12 }}>{error}</div>}
          <div className="row">
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button className="btn" type="button" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          {brand.banned_topics && brand.banned_topics.length > 0 && (
            <div className="pillar-tag">Banned topics: {brand.banned_topics.join(", ")}</div>
          )}
          {brand.voice_guide && (
            <div className="body-text" style={{ fontSize: 13, color: "var(--text-dim)" }}>
              {brand.voice_guide}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PillarRow({ pillar, onSaved }: { pillar: Pillar; onSaved: (p: Pillar) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(pillar.name);
  const [description, setDescription] = useState(pillar.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updatePillar(pillar.id, { name, description });
      onSaved(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    setSaving(true);
    setError(null);
    try {
      onSaved(await api.updatePillar(pillar.id, { active: !pillar.active }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={pillar.active ? undefined : { opacity: 0.6 }}>
      <div className="card-head">
        {editing ? (
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 260 }} />
        ) : (
          <strong>{pillar.name}</strong>
        )}
        {!pillar.active && <span className="badge warn">inactive</span>}
        <div className="row" style={{ marginLeft: "auto", marginTop: 0 }}>
          {editing ? (
            <>
              <button className="btn primary" onClick={handleSave} disabled={saving}>
                Save
              </button>
              <button className="btn" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => setEditing(true)} disabled={saving}>
                ✏️ Edit
              </button>
              <button className="btn" onClick={toggleActive} disabled={saving}>
                {pillar.active ? "Deactivate" : "Reactivate"}
              </button>
            </>
          )}
        </div>
      </div>
      {editing ? (
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      ) : (
        pillar.description && <div className="pillar-tag">{pillar.description}</div>
      )}
      {error && <div className="error-box" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}

function AddPillar({ onAdded }: { onAdded: (p: Pillar) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const pillar = await api.createPillar({ name: name.trim(), description: description.trim() || undefined });
      onAdded(pillar);
      setName("");
      setDescription("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add pillar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <div className="card-head">
        <strong>Add a pillar</strong>
      </div>
      <label htmlFor="p-name">Name</label>
      <input id="p-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
      <label htmlFor="p-desc">Description (optional)</label>
      <input id="p-desc" type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
      {error && <div className="error-box" style={{ marginTop: 12 }}>{error}</div>}
      <div className="row">
        <button className="btn primary" type="submit" disabled={saving || !name.trim()}>
          {saving ? "Adding…" : "Add pillar"}
        </button>
      </div>
    </form>
  );
}

export function PillarsView() {
  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    Promise.all([api.listPillars({ all: true }), api.getBrand()])
      .then(([p, b]) => {
        setPillars(p);
        setBrand(b);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load"));
  }

  useEffect(load, []);

  if (error) return <div className="error-box">{error}</div>;

  return (
    <div>
      <OnboardingPanel onApplied={load} />
      {brand && <BrandEditor brand={brand} onSaved={setBrand} />}
      {pillars.map((p) => (
        <PillarRow
          key={p.id}
          pillar={p}
          onSaved={(updated) => setPillars((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
        />
      ))}
      {pillars.length === 0 && !error && <div className="empty">No pillars configured.</div>}
      <AddPillar onAdded={(p) => setPillars((prev) => [...prev, p])} />
    </div>
  );
}
