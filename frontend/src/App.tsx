import { useEffect, useState } from "react";
import { api, clearToken, getToken } from "./api";
import { Login } from "./components/Login";
import { DraftQueue } from "./components/DraftQueue";
import { NewTopicForm } from "./components/NewTopicForm";
import { PillarsView } from "./components/PillarsView";
import { MetricsView } from "./components/MetricsView";

const TABS = [
  {
    key: "queue",
    label: "Review queue",
    icon: "📥",
    title: "Review queue",
    subtitle: "Approve, edit, reject, schedule, or hold drafts before they go out.",
  },
  {
    key: "new",
    label: "New topic",
    icon: "✍️",
    title: "New topic",
    subtitle: "Pick platforms, add context, and generate drafts for review.",
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
    const id = setInterval(refreshPendingCount, 30000);
    return () => clearInterval(id);
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

        <nav className="side-nav">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? "active" : ""}
              onClick={() => goTo(t.key)}
            >
              <span className="side-nav-icon">{t.icon}</span>
              <span className="side-nav-label">{t.label}</span>
              {t.key === "queue" && !!pendingCount && (
                <span className="nav-badge">{pendingCount}</span>
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
        {tab === "new" && <NewTopicForm />}
        {tab === "pillars" && <PillarsView />}
        {tab === "metrics" && <MetricsView />}
      </main>
    </div>
  );
}
