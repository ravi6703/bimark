import { useEffect, useState } from "react";
import {
  api,
  ApiError,
  type EvalCaseSummary,
  type EvalRun,
  type PromptVersionStats,
} from "../api";
import { InfoCallout } from "./InfoCallout";
import { platformLabel } from "../platforms";

/**
 * Move 5 — turn prompt changes from opinion into measurement.
 *
 * Two kinds of evidence, kept visibly apart because they support very
 * different claims:
 *
 *  - The report is observational and free. It groups real drafts by the
 *    prompt version that made them — but different versions saw different
 *    topics at different times, so a difference is a reason to look, not proof.
 *  - A run is controlled and costs a generation per case. Same frozen inputs,
 *    today's prompts. That one can actually attribute a change.
 */

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function PromptQualityView() {
  const [data, setData] = useState<{
    currentPromptVersion: string;
    report: PromptVersionStats[];
    cases: EvalCaseSummary[];
    runs: EvalRun[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    try {
      setData(await api.getEval());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load prompt quality data.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function harvest() {
    setBusy("harvest");
    setNotice(null);
    try {
      const { added } = await api.harvestEvalCases();
      setNotice(
        added === 0
          ? "No new cases — every approve-with-edits is already in the set."
          : `Added ${added} case${added === 1 ? "" : "s"} from real edits.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Harvest failed.");
    } finally {
      setBusy(null);
    }
  }

  async function run() {
    setBusy("run");
    setNotice(null);
    try {
      const { remaining } = await api.runEval();
      // Never let a capped batch read as "the whole set was evaluated".
      setNotice(
        remaining > 0
          ? `Scored a batch. ${remaining} case${remaining === 1 ? "" : "s"} still unscored — run again to continue.`
          : "Scored every case in the set.",
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Eval run failed.");
    } finally {
      setBusy(null);
    }
  }

  if (error) return <p className="error-box">{error}</p>;
  if (!data) return <p className="subtle">Loading…</p>;

  return (
    <div className="results-view">
      <InfoCallout
        icon="🔬"
        summary={`Current prompt version: ${data.currentPromptVersion}. Two kinds of evidence, deliberately separated.`}
        detail={
          "The version report below is observational: it groups drafts by the prompt that " +
          "produced them. It's free and always available, but confounded — different versions " +
          "saw different topics, with different reviewers, in different months. Treat a gap as " +
          "a reason to investigate, not as proof. A golden-set run is the controlled version: " +
          "the same frozen inputs re-run through today's prompts, so a difference is " +
          "attributable. It costs one generation per case, which is why you trigger it."
        }
      />

      <section className="card">
        <div className="card-head">
          <strong>By prompt version (observational)</strong>
        </div>
        {data.report.length === 0 ? (
          <p className="subtle">No drafts yet.</p>
        ) : (
          <table className="results-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Decided</th>
                <th>First-pass</th>
                <th>Mean edit</th>
                <th>Flagged</th>
                <th>Repetitive</th>
              </tr>
            </thead>
            <tbody>
              {data.report.map((r) => (
                <tr key={r.promptVersion}>
                  <td>
                    <b>{r.promptVersion}</b>
                    {r.promptVersion === data.currentPromptVersion && (
                      <span className="badge" style={{ marginLeft: 6 }}>
                        current
                      </span>
                    )}
                  </td>
                  <td>{r.decided}</td>
                  <td>{r.decided === 0 ? "—" : pct(r.firstPassApprovalRate)}</td>
                  <td>{r.meanEditDistance ?? "—"}</td>
                  <td>{pct(r.flagRate)}</td>
                  <td>{pct(r.repetitiveRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="subtle">
          A low first-pass rate is not automatically a bad prompt. On LinkedIn a substantial human
          edit is what makes the post read as human — which is what the ranking rewards.
        </p>
      </section>

      <section className="card">
        <div className="card-head">
          <strong>Golden set (controlled)</strong>
          <span className="badge" style={{ marginLeft: "auto" }}>
            {data.cases.length} case{data.cases.length === 1 ? "" : "s"}
          </span>
        </div>
        <p>
          Every draft someone approved <i>with edits</i> is a labelled example: what the AI wrote,
          and what a person was actually willing to publish. Nobody has to author these — the team
          produces them by doing their job.
        </p>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={harvest} disabled={busy != null}>
            {busy === "harvest" ? "Harvesting…" : "Harvest new cases"}
          </button>
          <button className="btn" onClick={run} disabled={busy != null || data.cases.length === 0}>
            {busy === "run" ? "Scoring…" : "Score a batch"}
          </button>
        </div>
        {notice && <p className="subtle">{notice}</p>}
        {data.cases.length === 0 && (
          <p className="subtle">
            No cases yet. They appear once drafts have been approved with edits — only edits made
            after the AI's original text started being preserved can be used, so a brand-new
            install starts empty by design rather than showing misleading perfect scores.
          </p>
        )}
        {data.cases.length > 0 && (
          <table className="results-table">
            <thead>
              <tr>
                <th>Angle</th>
                <th>Channel</th>
                <th>Made by</th>
                <th>Edit distance</th>
              </tr>
            </thead>
            <tbody>
              {data.cases.slice(0, 20).map((c) => (
                <tr key={c.id}>
                  <td>{c.angle ?? <span className="subtle">untitled</span>}</td>
                  <td>{platformLabel(c.platform)}</td>
                  <td>{c.prompt_version ?? "—"}</td>
                  <td>{c.edit_distance ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {data.runs.length > 0 && (
        <section className="card">
          <div className="card-head">
            <strong>Scored runs</strong>
          </div>
          <table className="results-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Version</th>
                <th>Cases</th>
                <th>Similarity ↑</th>
                <th>Edit distance ↓</th>
                <th>Run by</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.ran_at).toLocaleDateString()}</td>
                  <td>{r.prompt_version}</td>
                  <td>{r.cases_run}</td>
                  <td>{r.mean_similarity ?? "—"}</td>
                  <td>{r.mean_edit_distance ?? "—"}</td>
                  <td>{r.ran_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="subtle">
            Similarity is how close the replay landed to the human's version; edit distance is how
            much rewriting it would still need. They disagree in useful ways — a full rewrite that
            preserves the meaning scores well on the first and badly on the second, and that gap is
            the interesting signal.
          </p>
        </section>
      )}
    </div>
  );
}
