import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type TeamMember } from "../api";

export function TeamView() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setMembers(await api.listTeammates());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load team");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    setSuccess(null);
    setAdding(true);
    try {
      await api.addTeammate(name.trim(), password);
      setSuccess(`${name.trim()} can now sign in with that password.`);
      setName("");
      setPassword("");
      await load();
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "Failed to add teammate");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div>
      <div className="card">
        <div className="card-head">
          <strong>Add a teammate</strong>
        </div>
        <p className="pillar-tag" style={{ marginBottom: 10 }}>
          Anyone on the team can add another — every action they take (approve, edit, reject, publish)
          will be attributed to this name.
        </p>
        <form onSubmit={handleAdd}>
          <label htmlFor="new-name">Name</label>
          <input
            id="new-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Priya"
          />
          <label htmlFor="new-pw">Password (8+ characters)</label>
          <input
            id="new-pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {addError && <div className="error-box" style={{ marginTop: 12 }}>{addError}</div>}
          {success && <div className="success-box" style={{ marginTop: 12 }}>{success}</div>}
          <div className="row">
            <button className="btn primary" type="submit" disabled={adding || !name || password.length < 8}>
              {adding ? "Adding…" : "Add teammate"}
            </button>
          </div>
        </form>
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading && <div className="spinner-text">Loading…</div>}
      {!loading &&
        members.map((m) => (
          <div className="card" key={m.id}>
            <div className="card-head">
              <strong>{m.name}</strong>
              {!m.active && <span className="badge warn">inactive</span>}
              <span className="pillar-tag" style={{ marginLeft: "auto" }}>
                joined {new Date(m.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        ))}
      {!loading && members.length === 0 && !error && <div className="empty">No teammates yet.</div>}
    </div>
  );
}
