import { useEffect, useState } from "react";
import { api, ApiError, type Brand, type Pillar } from "../api";

export function PillarsView() {
  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listPillars(), api.getBrand()])
      .then(([p, b]) => {
        setPillars(p);
        setBrand(b);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load"));
  }, []);

  if (error) return <div className="error-box">{error}</div>;

  return (
    <div>
      {brand && (
        <div className="card">
          <div className="card-head">
            <strong>{brand.name}</strong>
          </div>
          {brand.banned_topics && brand.banned_topics.length > 0 && (
            <div className="pillar-tag">Banned topics: {brand.banned_topics.join(", ")}</div>
          )}
          {brand.voice_guide && (
            <div className="body-text" style={{ fontSize: 13, color: "var(--text-dim)" }}>
              {brand.voice_guide}
            </div>
          )}
        </div>
      )}
      {pillars.map((p) => (
        <div className="card" key={p.id}>
          <div className="card-head">
            <strong>{p.name}</strong>
          </div>
          {p.description && <div className="pillar-tag">{p.description}</div>}
        </div>
      ))}
      {pillars.length === 0 && !error && <div className="empty">No pillars configured.</div>}
    </div>
  );
}
