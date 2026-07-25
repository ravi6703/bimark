import { useEffect, useState } from "react";
import { api, clearToken, getToken } from "./api";
import { Login } from "./components/Login";
import { DraftQueue } from "./components/DraftQueue";
import { NewTopicForm } from "./components/NewTopicForm";
import { PillarsView } from "./components/PillarsView";
import { MetricsView } from "./components/MetricsView";
import { TeamView } from "./components/TeamView";
import { TopicsView } from "./components/TopicsView";
import { InsightsView } from "./components/InsightsView";
import { CalendarView } from "./components/CalendarView";

const TABS = [
  {
    key: "queue",
    label: "Review queue",
    icon: "📥",
    title: "Review queue",
    subtitle: "Approve, edit, reject, schedule, or hold drafts before they go out.",
  },
  {
    key: "calendar",
    label: "Calendar",
    icon: "📅",
    title: "Calendar",
    subtitle: "Everything scheduled or published, by day.",
  },
  {
    key: "new",
    label: "New topic",
    icon: "✍️",
    title: "New topic",
    subtitle: "Pick platforms, add context, and generate drafts for review.",
  },
  {
    key: "topics",
    label: "Topics",
    icon: "💡",
    title: "Topics",
    subtitle: "Every topic the pipeline has suggested or been given, AI and manual alike.",
  },
  {
    key: "insights",
    label: "Insights",
    icon: "🗒️",
    title: "Insights",
    subtitle: "The monthly editorial memo — what landed, what didn't, and why.",
  },
  {
    key: "pillars",
    label: "Pillars & brand",
    icon: "🧭",
    title: "Pillars & brand",
    subtitle: "Your content pillars and brand voice guide.",
  },
  {
    key: "metrics",
    label: "Metrics",
    icon: "📊",
    title: "Metrics",
    subtitle: "Draft quality trends over time.",
  },
  {
    key: "team",
    label: "Team",
    icon: "👥",
    title: "Team",
    subtitle: "Who's on the team, and who did what — everyone signs in by name now.",
  },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [tab, setTab] = useState<TabKey>("queue");
  const [navOpen, setNavOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  async function refreshPendingCount() {
    try {
      const drafts = await api.listDrafts("pending_approval");
      setPendingCount(drafts.length);
    } catch {
      // badge is a nice-to-have; ignore failures silently
    }
  }

  useEffect(() => {
    if (!authed) return;
    refreshPendingCount();
    // A shorter fallback interval plus an immediate refetch whenever this tab
    // regains focus — a shared queue's badge goes stale fast on a plain
    // 30s-only timer, and staleness directly causes teammates to duplicate
    // each other's work (audit Phase 2). True push isn't viable on Vercel's
    // serverless functions, so this is the practical substitute.
    const id = setInterval(refreshPendingCount, 20000);
    window.addEventListener("focus", refreshPendingCount);
    document.addEventListener("visibilitychange", refreshPendingCount);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", refreshPendingCount);
      document.removeEventListener("visibilitychange", refreshPendingCount);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  if (!authed) {
    return <Login onLoggedIn={() => setAuthed(true)} />;
  }

  const active = TABS.find((t) => t.key === tab)!;

  function goTo(key: TabKey) {
    setTab(key);
    setNavOpen(false);
  }

  return (
    <div className="app-shell">
      <button
        className="nav-toggle"
        onClick={() => setNavOpen((v) => !v)}
        aria-label="Toggle navigation"
      >
        ☰ <span>{active.label}</span>
      </button>

      <div className={`sidebar-backdrop ${navOpen ? "show" : ""}`} onClick={() => setNavOpen(false)} />

      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">BI</div>
          <div>
            <div className="brand-name">Board Infinity</div>
            <div className="brand-sub">Presence dashboard</div>
          </div>
        </div>

        <nav className="side-nav" role="navigation" aria-label="Main">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? "active" : ""}
              aria-current={tab === t.key ? "page" : undefined}
              onClick={() => goTo(t.key)}
            >
              <span className="side-nav-icon">{t.icon}</span>
              <span className="side-nav-label">{t.label}</span>
              {t.key === "queue" && !!pendingCount && (
                <span className="nav-badge" aria-live="polite" aria-atomic="true">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className="logout"
            onClick={() => {
              clearToken();
              setAuthed(false);
            }}
          >
            Log out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="page-header">
          <h1>{active.title}</h1>
          <p>{active.subtitle}</p>
        </header>

        {tab === "queue" && <DraftQueue onDraftsChanged={refreshPendingCount} />}
        {tab === "calendar" && <CalendarView />}
        {tab === "new" && <NewTopicForm />}
        {tab === "topics" && <TopicsView />}
        {tab === "insights" && <InsightsView />}
        {tab === "pillars" && <PillarsView />}
        {tab === "metrics" && <MetricsView />}
        {tab === "team" && <TeamView />}
      </main>
    </div>
  );
}
