import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { api, ApiError, type Brand, type Pillar } from "../api";
import { OnboardingPanel } from "./OnboardingPanel";
import { ReadinessPanel } from "./ReadinessPanel";

function BrandEditor({ brand, onSaved }: { brand: Brand; onSaved: (b: Brand) => void }) {
  const [voiceGuide, setVoiceGuide] = useState(brand.voice_guide ?? "");
  const [visualNotes, setVisualNotes] = useState(brand.visual_notes ?? "");
  const [bannedTopics, setBannedTopics] = useState((brand.banned_topics ?? []).join(", "));
  const [siteUrl, setSiteUrl] = useState(brand.site_url ?? "");
  const [ayrshareApiKey, setAyrshareApiKey] = useState("");
  const [ayrshareProfileKey, setAyrshareProfileKey] = useState("");
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
        site_url: siteUrl.trim(),
        // Only send these if the operator actually typed something — an
        // empty field must never overwrite an already-configured credential.
        ayrshare_api_key: ayrshareApiKey.trim() || undefined,
        ayrshare_profile_key: ayrshareProfileKey.trim() || undefined,
      });
      onSaved(updated);
      setAyrshareApiKey("");
      setAyrshareProfileKey("");
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
          <label htmlFor="site-url">Website (used by the technical SEO audit)</label>
          <input
            id="site-url"
            type="text"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            placeholder="e.g. https://www.boardinfinity.com"
          />

          <div className="pillar-tag" style={{ marginTop: 14, marginBottom: 4, fontWeight: 700 }}>
            Publish accounts (Ayrshare)
          </div>
          <p className="pillar-tag" style={{ marginBottom: 8 }}>
            Leave blank to keep posting through the shared account. Set these once this brand has its
            own connected LinkedIn/X/Instagram accounts — either its own Ayrshare API key, or (if you're
            on Ayrshare's multi-profile plan) that brand's Profile Key.
          </p>
          <label htmlFor="ayr-key">
            Ayrshare API key {brand.has_ayrshare_api_key ? "(configured — leave blank to keep it)" : ""}
          </label>
          <input
            id="ayr-key"
            type="password"
            value={ayrshareApiKey}
            onChange={(e) => setAyrshareApiKey(e.target.value)}
            placeholder={brand.has_ayrshare_api_key ? "••••••••" : "not set"}
          />
          <label htmlFor="ayr-profile">
            Ayrshare Profile Key {brand.has_ayrshare_profile_key ? "(configured — leave blank to keep it)" : ""}
          </label>
          <input
            id="ayr-profile"
            type="password"
            value={ayrshareProfileKey}
            onChange={(e) => setAyrshareProfileKey(e.target.value)}
            placeholder={brand.has_ayrshare_profile_key ? "••••••••" : "not set"}
          />

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
          <div className="pillar-tag">
            Website: {brand.site_url || "not set (used by the technical SEO audit)"}
          </div>
          <div className="pillar-tag">
            Publish accounts:{" "}
            {brand.has_ayrshare_api_key || brand.has_ayrshare_profile_key
              ? "own connected accounts configured ✓"
              : "posting through the shared account (no brand-specific accounts connected yet)"}
          </div>
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

/** data:<mime>;base64,XXXX -> just the base64 part the upload API expects. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * Brand logo upload (LinkedIn multi-image follow-up) — this is the real
 * asset generated images get watermarked with. Nothing is watermarked, and
 * nothing is invented, until a real logo is uploaded here.
 */
function BrandLogoUploader({ brand, onChanged }: { brand: Brand; onChanged: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ALLOWED_LOGO_TYPES.has(file.type)) {
      setError("Logo must be a PNG, JPEG, or WebP image.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const data = await fileToBase64(file);
      await api.uploadBrandLogo({ data, mime_type: file.type });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setUploading(true);
    setError(null);
    try {
      await api.deleteBrandLogo();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Remove failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <strong>Brand logo</strong>
      </div>
      <p className="pillar-tag" style={{ marginBottom: 8 }}>
        Watermarked onto the bottom-right corner of generated LinkedIn/Instagram images,
        automatically, once set. Images generate without a mark until a real logo is uploaded here
        — nothing placeholder gets stamped on in the meantime.
      </p>
      {brand.has_logo ? (
        <div className="row" style={{ alignItems: "center", marginBottom: 10 }}>
          <img
            src={api.brandLogoUrl(brand.id)}
            alt={`${brand.name} logo`}
            style={{ maxWidth: 140, maxHeight: 70, borderRadius: 6, border: "1px solid var(--border)" }}
          />
          <button className="btn danger" onClick={handleRemove} disabled={uploading}>
            {uploading ? "Removing…" : "Remove logo"}
          </button>
        </div>
      ) : (
        <div className="pillar-tag" style={{ marginBottom: 10 }}>
          No logo uploaded yet.
        </div>
      )}
      <label className="btn" style={{ cursor: "pointer", display: "inline-block" }}>
        {uploading ? "Uploading…" : brand.has_logo ? "Replace logo" : "Upload logo"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFile}
          disabled={uploading}
          style={{ display: "none" }}
        />
      </label>
      {error && <div className="error-box" style={{ marginTop: 10 }}>{error}</div>}
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
      <IntentControl pillar={pillar} onSaved={onSaved} />
      {error && <div className="error-box" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}

/**
 * Move 4 — what this pillar is FOR.
 *
 * Generation optimises for credibility over lead-gen, which is right for most
 * pillars and wrong for the ones that exist to convert. Rather than the whole
 * product picking one answer, each pillar says which trade it's making.
 * 'authority' is the default and reproduces the original behaviour exactly.
 */
function IntentControl({
  pillar,
  onSaved,
}: {
  pillar: Pillar;
  onSaved: (p: Pillar) => void;
}) {
  const [target, setTarget] = useState(pillar.conversion_target ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setIntent(intent: "authority" | "conversion") {
    setSaving(true);
    setError(null);
    try {
      onSaved(
        await api.updatePillar(pillar.id, {
          intent,
          // Switching to authority clears the offer server-side too, so a
          // retired call to action can't keep leaking into generated copy.
          conversion_target: intent === "authority" ? null : target.trim() || null,
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change intent");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div className="row" style={{ gap: 6, alignItems: "center" }}>
        <span className="subtle">Posts on this pillar:</span>
        <button
          type="button"
          className={`btn${pillar.intent === "authority" ? " primary" : ""}`}
          onClick={() => setIntent("authority")}
          disabled={saving || pillar.intent === "authority"}
          aria-pressed={pillar.intent === "authority"}
        >
          Build authority
        </button>
        <button
          type="button"
          className={`btn${pillar.intent === "conversion" ? " primary" : ""}`}
          onClick={() => setIntent("conversion")}
          disabled={saving || pillar.intent === "conversion"}
          aria-pressed={pillar.intent === "conversion"}
        >
          Earn a next step
        </button>
      </div>
      {pillar.intent === "conversion" ? (
        <div style={{ marginTop: 8 }}>
          <input
            type="text"
            value={target}
            placeholder="the one next step to offer, e.g. the placement programme page"
            onChange={(e) => setTarget(e.target.value)}
            onBlur={() => {
              if (target.trim() !== (pillar.conversion_target ?? "")) void setIntent("conversion");
            }}
            style={{ width: "100%", maxWidth: 460 }}
          />
          <p className="subtle">
            Offered once, at the end, in a plain sentence. Credibility still comes first — the post
            has to stand on its own insight even if nobody clicks.
          </p>
        </div>
      ) : (
        <p className="subtle">No call to action. This is the default and suits most pillars.</p>
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
      {/* Move 6 — the full checklist lives here, next to the settings that
          resolve it, so a failing check is one scroll from its fix. */}
      <ReadinessPanel />
      <OnboardingPanel onApplied={load} />
      {brand && <BrandEditor brand={brand} onSaved={setBrand} />}
      {brand && <BrandLogoUploader brand={brand} onChanged={load} />}
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
