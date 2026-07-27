import { useEffect, useState } from "react";
import { api, ApiError, type Outcome, type Scoreboard, type TimeBaseline } from "../api";
import { InfoCallout } from "./InfoCallout";
import { StatTile } from "./StatTile";
import { platformLabel } from "../platforms";

/**
 * Move 2 — the one screen that answers "is this earning its place".
 *
 * Deliberately boring, and deliberately honest. Four numbers, each either
 * measured or explicitly marked as not set up yet. Nothing here estimates on
 * the platform's behalf: this is the screen leadership reads, and a
 * confidently-wrong number on it is worse than a blank.
 */

function pct(x: number | null): string {
  return x == null ? "—" : `${Math.round(x * 100)}%`;
}

/** Monday of the current week, matching the server's own anchor. */
function currentWeekStart(): string {
  const d = new Date();
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  utc.setUTCDate(utc.getUTCDate() - ((utc.getUTCDay() + 6) % 7));
  return utc.toISOString().slice(0, 10);
}

export function ResultsView() {
  const [board, setBoard] = useState<Scoreboard | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [baseline, setBaseline] = useState<TimeBaseline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [b, o, tb] = await Promise.all([
        api.getScoreboard(),
        api.listOutcomes(),
        api.getTimeBaseline(),
      ]);
      setBoard(b);
      setOutcomes(o);
      setBaseline(tb);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load results.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <p className="subtle">Loading results…</p>;
  if (error) return <p className="error-box">{error}</p>;
  if (!board) return null;

  const { cadence, queue, hours, inbound } = board;
  const cadenceTone =
    cadence.target == null ? "neutral" : cadence.published >= cadence.target ? "green" : "amber";

  return (
    <div className="results-view">
      <InfoCallout
        icon="🎯"
        summary="Four numbers, measured — nothing here is estimated on your behalf."
        detail={
          "Success for bimark was defined as inbound/leads plus marketing hours saved. " +
          "Cadence and queue health are measured directly from what actually published and " +
          "what reviewers actually did. Hours saved multiplies the real published count by " +
          "your team's own before/after estimate — the estimate is yours, the count is ours. " +
          "Inbound shows recorded results next to how much of what you published is even " +
          "attributable, because a low lead count with low link coverage means something " +
          "very different from a low lead count with full coverage."
        }
      />

      <div className="stat-grid">
        <StatTile
          icon="📅"
          value={cadence.target == null ? `${cadence.published}` : `${cadence.published}/${cadence.target}`}
          label={`Published this week${cadence.target == null ? " (no target set)" : ""}`}
          tone={cadenceTone}
        />
        <StatTile
          icon="✅"
          value={pct(queue.firstPassApprovalRate)}
          label={
            queue.sample === 0
              ? "First-pass approvals — no decisions yet"
              : `First-pass approvals (${queue.sample} decisions)`
          }
          tone={queue.firstPassApprovalRate == null ? "neutral" : queue.firstPassApprovalRate >= 0.6 ? "green" : "amber"}
        />
        <StatTile
          icon="⏱"
          value={hours.configured ? `${hours.hoursSaved}h` : "—"}
          label={hours.configured ? "Hours saved (your estimate × real posts)" : "Hours saved — baseline not set"}
          tone={hours.configured ? "accent" : "neutral"}
        />
        <StatTile
          icon="📈"
          value={inbound.leads}
          label={`Leads recorded (last 90 days)`}
          tone={inbound.leads > 0 ? "green" : "neutral"}
        />
      </div>

      <section className="card">
        <div className="card-head"><strong>Cadence by channel — week of {board.weekStart}</strong></div>
        {cadence.byPlatform.length === 0 ? (
          <p className="subtle">
            No channels configured yet. Set a weekly target on the Channels screen and this fills in.
          </p>
        ) : (
          <table className="results-table">
            <thead>
              <tr>
                <th>Channel</th>
                <th>Published</th>
                <th>Target</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {cadence.byPlatform.map((l) => (
                <tr key={l.platform}>
                  <td>{platformLabel(l.platform)}</td>
                  <td>{l.published}</td>
                  <td>{l.target ?? "—"}</td>
                  <td>
                    {l.target == null ? (
                      <span className="subtle">no target</span>
                    ) : l.published >= l.target ? (
                      <span className="badge badge-good">on track</span>
                    ) : (
                      <span className="badge badge-warn">{l.target - l.published} to go</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <div className="card-head"><strong>Review queue health</strong></div>
        <ul className="results-list">
          <li>
            <b>{queue.awaitingReview}</b> draft{queue.awaitingReview === 1 ? "" : "s"} waiting on a
            decision right now.
          </li>
          <li>
            Median time from draft to decision:{" "}
            <b>{queue.medianHoursToDecision == null ? "—" : `${queue.medianHoursToDecision}h`}</b>
            {queue.medianHoursToDecision == null && (
              <span className="subtle"> (nothing decided yet)</span>
            )}
          </li>
          <li>
            {/* Move 3's reframe, stated where the number lives: on LinkedIn a
                substantial human edit is the system working, not failing. */}
            First-pass approval rate is <b>{pct(queue.firstPassApprovalRate)}</b>. A lower rate is
            not automatically bad — a reviewer's edit is what makes a post read as human, which is
            exactly what LinkedIn's ranking rewards.
          </li>
        </ul>
      </section>

      <HoursPanel baseline={baseline} hours={hours} onSaved={load} />
      <InboundPanel inbound={inbound} outcomes={outcomes} onChanged={load} />
    </div>
  );
}

function HoursPanel({
  baseline,
  hours,
  onSaved,
}: {
  baseline: TimeBaseline | null;
  hours: Scoreboard["hours"];
  onSaved: () => void;
}) {
  const [before, setBefore] = useState(String(baseline?.minutes_per_post_before ?? ""));
  const [after, setAfter] = useState(String(baseline?.minutes_per_post_after ?? ""));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.recordTimeBaseline({
        minutes_per_post_before: Number(before),
        minutes_per_post_after: Number(after),
        note: note || undefined,
      });
      setNote("");
      onSaved();
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : "Could not save the baseline.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card-head"><strong>Hours saved</strong></div>
      {hours.configured ? (
        <p>
          <b>{hours.hoursSaved} hours</b> across {hours.postsCounted} posts published in the last 90
          days — {hours.minutesPerPostBefore} min per post before, {hours.minutesPerPostAfter} min
          now.{" "}
          <span className="subtle">
            The per-post minutes are your team's own estimate; only the post count is measured.
          </span>
        </p>
      ) : (
        <p className="subtle">{"reason" in hours ? hours.reason : ""}</p>
      )}
      <form onSubmit={save} className="results-form">
        <label>
          Minutes per post, before bimark
          <input
            type="number"
            min={1}
            required
            value={before}
            onChange={(e) => setBefore(e.target.value)}
          />
        </label>
        <label>
          Minutes per post, now
          <input
            type="number"
            min={0}
            required
            value={after}
            onChange={(e) => setAfter(e.target.value)}
          />
        </label>
        <label>
          Note (optional)
          <input
            type="text"
            value={note}
            placeholder="who estimated this, and how"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button className="btn" disabled={busy}>
          {baseline ? "Update estimate" : "Save baseline"}
        </button>
      </form>
      {err && <p className="error-box">{err}</p>}
      {!baseline && (
        <p className="subtle">
          Capture this <b>before</b> wider rollout. A month in, nobody can recall what the old
          process cost, and the number becomes unrecoverable.
        </p>
      )}
    </section>
  );
}

function InboundPanel({
  inbound,
  outcomes,
  onChanged,
}: {
  inbound: Scoreboard["inbound"];
  outcomes: Outcome[];
  onChanged: () => void;
}) {
  const [leads, setLeads] = useState("");
  const [signups, setSignups] = useState("");
  const [period, setPeriod] = useState(currentWeekStart());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.recordOutcome({
        leads: Number(leads || 0),
        signups: Number(signups || 0),
        period_start: period,
        note: note || undefined,
      });
      setLeads("");
      setSignups("");
      setNote("");
      onChanged();
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : "Could not record that.");
    } finally {
      setBusy(false);
    }
  }

  const coverage =
    inbound.totalPosts === 0
      ? null
      : Math.round((inbound.attributablePosts / inbound.totalPosts) * 100);

  return (
    <section className="card">
      <div className="card-head"><strong>Inbound &amp; leads</strong></div>
      <p>
        <b>{inbound.leads}</b> leads and <b>{inbound.signups}</b> signups recorded across{" "}
        {inbound.entries} entr{inbound.entries === 1 ? "y" : "ies"} in the last 90 days.
      </p>
      <p className="subtle">
        {inbound.totalPosts === 0
          ? "Nothing published in this window yet, so there is nothing to attribute."
          : `${inbound.attributablePosts} of ${inbound.totalPosts} published posts (${coverage}%) carried a tracked link. ` +
            (coverage === 0
              ? "None are traceable — posts need a link to your own site, and the brand needs its site URL set, before any of this can be attributed."
              : "Posts without a link to your own site can't be attributed to inbound at all.")}
      </p>

      <form onSubmit={save} className="results-form">
        <label>
          Week starting
          <input type="date" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </label>
        <label>
          Leads
          <input type="number" min={0} value={leads} onChange={(e) => setLeads(e.target.value)} />
        </label>
        <label>
          Signups
          <input
            type="number"
            min={0}
            value={signups}
            onChange={(e) => setSignups(e.target.value)}
          />
        </label>
        <label>
          Note (optional)
          <input
            type="text"
            value={note}
            placeholder="where this number came from"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button className="btn" disabled={busy}>
          Record
        </button>
      </form>
      {err && <p className="error-box">{err}</p>}

      {outcomes.length > 0 && (
        <table className="results-table">
          <thead>
            <tr>
              <th>Week</th>
              <th>Leads</th>
              <th>Signups</th>
              <th>Source</th>
              <th>Recorded by</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {outcomes.map((o) => (
              <tr key={o.id}>
                <td>{o.period_start}</td>
                <td>{o.leads}</td>
                <td>{o.signups}</td>
                <td>{o.source}</td>
                <td>
                  {o.recorded_by}
                  {o.note && <span className="subtle"> — {o.note}</span>}
                </td>
                <td>
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => {
                      await api.deleteOutcome(o.id);
                      onChanged();
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
