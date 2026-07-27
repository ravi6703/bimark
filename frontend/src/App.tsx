import { useEffect, useState } from "react";
import { api, clearToken, getSelectedBrandSlug, getToken, setSelectedBrandSlug, type Brand } from "./api";
import { BrandNameProvider } from "./brandContext";
import { Login } from "./components/Login";
import { DraftQueue } from "./components/DraftQueue";
import { NewTopicForm } from "./components/NewTopicForm";
import { PillarsView } from "./components/PillarsView";
import { MetricsView } from "./components/MetricsView";
import { TeamView } from "./components/TeamView";
import { CampaignsView } from "./components/CampaignsView";
import { ChannelsView } from "./components/ChannelsView";
import { InsightsView } from "./components/InsightsView";
import { CalendarView } from "./components/CalendarView";
import { CompetitorsView } from "./components/CompetitorsView";
import { OverviewView } from "./components/OverviewView";
import { GeoVisibilityView } from "./components/GeoVisibilityView";
import { SeoAuditView } from "./components/SeoAuditView";
import { RedditView } from "./components/RedditView";
import { PortfolioView } from "./components/PortfolioView";

/**
 * `group` sorts a tab under a labeled section in the sidebar instead of a
 * flat 14-item list (UI/UX pass) — undefined means top-level, above every
 * section. Order here is also render order, so group members must stay
 * adjacent.
 */
const TABS = [
  {
    key: "portfolio",
    label: "Portfolio",
    icon: "🌐",
    title: "Portfolio",
    subtitle: "Every brand line at a glance, in one place — for a leadership/founder view.",
  },
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
    group: "Workspace",
  },
  {
    key: "calendar",
    label: "Calendar",
    icon: "📅",
    title: "Calendar",
    subtitle: "Everything scheduled or published, by day.",
    group: "Workspace",
  },
  {
    // Deliberately not in a nav group — a create-action doesn't belong
    // alongside "places to look at things" (UI/UX pass). Reachable via the
    // persistent "+ New topic" button in the page header instead; `hidden`
    // just keeps it out of the sidebar loop below while still working as a
    // normal tab (routing, page title, Overview's own button into it).
    key: "new",
    label: "New topic",
    icon: "✍️",
    title: "New topic",
    subtitle: "Pick platforms, add context, and generate drafts for review.",
    hidden: true,
  },
  {
    key: "campaigns",
    label: "Campaigns",
    icon: "💡",
    title: "Campaigns",
    subtitle: "One card per idea, with every channel it goes out on and where each one stands.",
    group: "Workspace",
  },
  {
    key: "channels",
    label: "Channels",
    icon: "📡",
    title: "Channels",
    subtitle: "Each channel's own queue, cadence and results.",
    group: "Workspace",
  },
  {
    key: "competitors",
    label: "Competitors",
    icon: "🕵️",
    title: "Competitors",
    subtitle: "What competitors are doing, and what we can learn from it.",
    group: "Growth intelligence",
  },
  {
    key: "geo",
    label: "AI search visibility",
    icon: "🛰️",
    title: "AI search visibility (GEO)",
    subtitle: "Real questions sent to Claude, checked for whether your brand actually gets cited.",
    group: "Growth intelligence",
  },
  {
    key: "seo",
    label: "SEO audit",
    icon: "🔧",
    title: "SEO audit",
    subtitle: "A real, rule-based technical audit of your actual site — nothing estimated.",
    group: "Growth intelligence",
  },
  {
    key: "reddit",
    label: "Reddit",
    icon: "💬",
    title: "Reddit",
    subtitle: "Real threads worth joining, with a draft reply to review before you post it yourself.",
    group: "Growth intelligence",
  },
  {
    key: "insights",
    label: "Insights",
    icon: "🗒️",
    title: "Insights",
    subtitle: "The monthly editorial memo — what landed, what didn't, and why.",
    group: "Growth intelligence",
  },
  {
    key: "metrics",
    label: "Metrics",
    icon: "📊",
    title: "Metrics",
    subtitle: "Draft quality trends over time.",
    group: "Growth intelligence",
  },
  {
    key: "pillars",
    label: "Pillars & brand",
    icon: "🧭",
    title: "Pillars & brand",
    subtitle: "Your content pillars and brand voice guide.",
    group: "Settings",
  },
  {
    key: "team",
    label: "Team",
    icon: "👥",
    title: "Team",
    subtitle: "Who's on the team, and who did what — everyone signs in by name now.",
    group: "Settings",
  },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function groupOf(t: (typeof TABS)[number]): string | undefined {
  return "group" in t ? t.group : undefined;
}
function isHidden(t: (typeof TABS)[number]): boolean {
  return "hidden" in t && t.hidden === true;
}
const VISIBLE_TABS = TABS.filter((t) => !isHidden(t));

export function App() {
  const [authed, setAuthed] = useState(!!getToken());
  // Lands on the cross-brand Portfolio rollup rather than one brand's
  // Overview — the more useful first screen once there's more than one
  // brand line to show (UI/UX pass).
  const [tab, setTab] = useState<TabKey>("portfolio");
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
          {VISIBLE_TABS.map((t, i) => {
            // A group's label renders once, right before its first member —
            // groups sort the sidebar into sections (UI/UX pass) instead of
            // one flat 14-item list.
            const group = groupOf(t);
            const prev = i > 0 ? VISIBLE_TABS[i - 1] : undefined;
            const isFirstInGroup = group && group !== (prev && groupOf(prev));
            return (
              <div key={t.key}>
                {isFirstInGroup && <div className="side-nav-group-label">{group}</div>}
                <button
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
              </div>
            );
          })}
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
          <div>
            <h1>{active.title}</h1>
            <p>{active.subtitle}</p>
          </div>
          {tab !== "new" && tab !== "portfolio" && (
            <button className="btn primary new-topic-cta" onClick={() => goTo("new")}>
              ✍️ New topic
            </button>
          )}
        </header>

        {tab === "portfolio" && (
          <PortfolioView
            onOpenBrand={(slug) => {
              handleBrandChange(slug);
              goTo("overview");
            }}
          />
        )}
        {tab === "overview" && <OverviewView onNavigate={(k) => goTo(k as TabKey)} />}
        {tab === "queue" && <DraftQueue onDraftsChanged={refreshPendingCount} />}
        {tab === "calendar" && <CalendarView />}
        {tab === "new" && <NewTopicForm />}
        {tab === "campaigns" && <CampaignsView onNavigate={(k) => goTo(k as TabKey)} />}
        {tab === "channels" && <ChannelsView />}
        {tab === "insights" && <InsightsView />}
        {tab === "competitors" && <CompetitorsView />}
        {tab === "geo" && <GeoVisibilityView />}
        {tab === "seo" && <SeoAuditView />}
        {tab === "reddit" && <RedditView />}
        {tab === "pillars" && <PillarsView />}
        {tab === "metrics" && <MetricsView />}
        {tab === "team" && <TeamView />}
      </main>
    </div>
    </BrandNameProvider>
  );
}
