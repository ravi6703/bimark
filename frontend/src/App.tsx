import { useState } from "react";
import { clearToken, getToken } from "./api";
import { Login } from "./components/Login";
import { DraftQueue } from "./components/DraftQueue";
import { NewTopicForm } from "./components/NewTopicForm";
import { PillarsView } from "./components/PillarsView";
import { MetricsView } from "./components/MetricsView";

const TABS = [
  { key: "queue", label: "Review queue" },
  { key: "new", label: "New topic" },
  { key: "pillars", label: "Pillars" },
  { key: "metrics", label: "Metrics" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [tab, setTab] = useState<TabKey>("queue");

  if (!authed) {
    return <Login onLoggedIn={() => setAuthed(true)} />;
  }

  return (
    <div className="shell">
      <div className="topbar">
        <h1 className="brand-title">
          Board Infinity Presence
          <span>Editor-in-chief dashboard</span>
        </h1>
        <div className="row" style={{ margin: 0, alignItems: "center" }}>
          <nav className="nav">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={tab === t.key ? "active" : ""}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </nav>
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
      </div>

      {tab === "queue" && <DraftQueue />}
      {tab === "new" && <NewTopicForm />}
      {tab === "pillars" && <PillarsView />}
      {tab === "metrics" && <MetricsView />}
    </div>
  );
}
