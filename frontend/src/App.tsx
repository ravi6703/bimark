import { useEffect, useState } from "react";
import { api, clearToken, getSelectedBrandSlug, getToken, setSelectedBrandSlug, type Brand } from "./api";
import { BrandNameProvider } from "./brandContext";
import { Login } from "./components/Login";
import { DraftQueue } from "./components/DraftQueue";
import { NewTopicForm } from "./components/NewTopicForm";
import { PillarsView } from "./components/PillarsView";
import { MetricsView } from "./components/MetricsView";
import { TeamView } from "./components/TeamView";
import { TopicsView } from "./components/TopicsView";
import { InsightsView } from "./components/InsightsView";
import { CalendarView } from "./components/CalendarView";
import { CompetitorsView } from "./components/CompetitorsView";
import { OverviewView } from "./components/OverviewView";
import { GeoVisibilityView } from "./components/GeoVisibilityView";
import { SeoAuditView } from "./components/SeoAuditView";

const TABS = [
  {
    key: "overview",
    label: "Overview",
    icon: "🏠",
    title: "Overview",
    subtitle: "Where things stand right now for this brand.",
  },
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
    key: "competitors",
    label: "Competitors",
    icon: "🕵️",
    title: "Competitors",
    subtitle: "What competitors are doing, and what we can learn from it.",
  },
  {
    key: "geo",
    label: "GEO visibility",
    icon: "🛰️",
    title: "GEO visibility",
    subtitle: "Real questions sent to Claude, checked for whether your brand actually gets cited.",
  },
  {
    key: "seo",
    label: "SEO audit",
    icon: "🔧",
    title: "SEO audit",
    subtitle: "A real, rule-based technical audit of your actual site — nothing estimated.",
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
  const [tab, setTab] = useState<TabKey>("overview");
  const [navOpen, setNavOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  // Brand switcher (multi-brand support) — Board Infinity runs several
  // distinct brand lines (Leadup Universe, InfyLearn, Elearning Solutions,
  // alongside Board Infinity itself), each its own content workspace.
  const [brandList, setBrandList] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);

  useEffect(() => {
    if (!authed) return;
    api
      .listBrands()
      .then((rows) => {
        setBrandList(rows);
        const stored = getSelectedBrandSlug();
        const valid = stored && rows.some((b) => b.slug === stored) ? stored : rows[0]?.slug ?? null;
        if (valid) {
          setSelectedBrandSlug(valid);
          setSelectedBrand(valid);
        }
      })
      .catch(() => {
        // brand list is a nice-to-have UI affordance; a request-level 500
        // will still surface wherever the failing call actually happens
      });
  }, [authed]);

  function handleBrandChange(slug: string) {
    setSelectedBrandSlug(slug);
    setSelectedBrand(slug);
    setNavOpen(false);
  }

  async function refreshPendingCount() {
    try {
      const drafts = await api.listDrafts("pending_approval");
      setPendingCount(drafts.length);
    } catch {
      // badge is a nice-to-have; ignore failures silently
    }
  }

  useEffect(() => {
    if (!authed || !selectedBrand) return;
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
  }, [authed, selectedBrand]);

  if (!authed) {
    return <Login onLoggedIn={() => setAuthed(true)} />;
  }

  const active = TABS.find((t) => t.key === tab)!;
  const currentBrandName = brandList.find((b) => b.slug === selectedBrand)?.name ?? "Board Infinity";

  function goTo(key: TabKey) {
    setTab(key);
    setNavOpen(false);
  }

  return (
    <BrandNameProvider value={currentBrandName}>
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
          <div className="brand-mark">
            {(brandList.find((b) => b.slug === selectedBrand)?.name ?? "BI")
              .split(/\s+/)
              .map((w) => w[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {brandList.length > 1 ? (
              <select
                className="brand-switcher"
                value={selectedBrand ?? ""}
                onChange={(e) => handleBrandChange(e.target.value)}
                aria-label="Switch brand workspace"
              >
                {brandList.map((b) => (
                  <option key={b.slug} value={b.slug}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="brand-name">
                {brandList.find((b) => b.slug === selectedBrand)?.name ?? "Board Infinity"}
              </div>
            )}
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

      <main className="main-content" key={selectedBrand ?? "no-brand"}>
        <header className="page-header">
          <h1>{active.title}</h1>
          <p>{active.subtitle}</p>
        </header>

        {tab === "overview" && <OverviewView onNavigate={(k) => goTo(k as TabKey)} />}
        {tab === "queue" && <DraftQueue onDraftsChanged={refreshPendingCount} />}
        {tab === "calendar" && <CalendarView />}
        {tab === "new" && <NewTopicForm />}
        {tab === "topics" && <TopicsView />}
        {tab === "insights" && <InsightsView />}
        {tab === "competitors" && <CompetitorsView />}
        {tab === "geo" && <GeoVisibilityView />}
        {tab === "seo" && <SeoAuditView />}
        {tab === "pillars" && <PillarsView />}
        {tab === "metrics" && <MetricsView />}
        {tab === "team" && <TeamView />}
      </main>
    </div>
    </BrandNameProvider>
  );
}
