import { useEffect, useMemo, useState } from "react";
import { api, ApiError, type PostItem } from "../api";
import { EmptyState } from "./EmptyState";

const DAY_MS = 24 * 3600 * 1000;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function dayKey(d: Date): string {
  return startOfDay(d).toISOString().slice(0, 10);
}
function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** The 6x7 grid of days covering every week that touches `month`. */
function buildGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, i) => new Date(gridStart.getTime() + i * DAY_MS));
}

export function CalendarView() {
  const [month, setMonth] = useState(() => startOfDay(new Date()));
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const grid = useMemo(() => buildGrid(month), [month]);
  const today = useMemo(() => dayKey(new Date()), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .listPosts({ from: grid[0]!.toISOString(), to: new Date(grid[41]!.getTime() + DAY_MS).toISOString() })
      .then((rows) => !cancelled && setPosts(rows))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Failed to load posts"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const byDay = useMemo(() => {
    const map = new Map<string, PostItem[]>();
    for (const p of posts) {
      const at = p.scheduled_at ?? p.published_at;
      if (!at) continue;
      const key = dayKey(new Date(at));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [posts]);

  return (
    <div>
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button className="btn" type="button" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Previous month">
            ‹
          </button>
          <span className="cal-month-label">{monthLabel(month)}</span>
          <button className="btn" type="button" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Next month">
            ›
          </button>
        </div>
        <button className="btn" type="button" onClick={() => setMonth(startOfDay(new Date()))}>
          Today
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading && <div className="spinner-text">Loading…</div>}

      {!loading && !error && posts.length === 0 && (
        <EmptyState
          icon="📅"
          title="Nothing scheduled or published this month"
          description={
            'This fills in from real posts — nothing invented here. Approve a draft in the Review ' +
            'queue and choose "Schedule" (pick a date/time) or "Publish now" and it\'ll show up on ' +
            "its day here. GEO and YouTube drafts don't auto-publish, so they only appear once you " +
            'mark them posted.'
          }
        />
      )}

      {!loading && !error && posts.length > 0 && (
        <div className="cal-grid" role="table" aria-label={`Post calendar for ${monthLabel(month)}`}>
          <div className="cal-weekdays" role="row">
            {WEEKDAY_LABELS.map((w) => (
              <div className="cal-weekday" key={w} role="columnheader">
                {w}
              </div>
            ))}
          </div>
          <div className="cal-days">
            {grid.map((d) => {
              const key = dayKey(d);
              const inMonth = d.getMonth() === month.getMonth();
              const items = byDay.get(key) ?? [];
              const isToday = key === today;
              return (
                <div className={`cal-day ${inMonth ? "" : "outside"} ${isToday ? "today" : ""}`} key={key} role="cell">
                  <span className="cal-day-num">{d.getDate()}</span>
                  <div className="cal-day-items">
                    {items.slice(0, 3).map((p) => (
                      <a
                        key={p.id}
                        className={`cal-item badge ${p.platform}`}
                        href={p.url ?? undefined}
                        target={p.url ? "_blank" : undefined}
                        rel={p.url ? "noreferrer" : undefined}
                        title={p.body ?? ""}
                      >
                        {(p.body ?? "").slice(0, 40) || p.platform}
                      </a>
                    ))}
                    {items.length > 3 && <span className="cal-more">+{items.length - 3} more</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
