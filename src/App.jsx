import { useState, useCallback, useEffect } from "react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { useStore } from "./store";
import { supabase } from "./supabase";
import Home from "./components/Home";
import Prospects from "./components/Prospects";
import Analytics from "./components/Analytics";
import Sequences from "./components/Sequences";
import Tasks from "./components/Tasks";
import ProspectDetail from "./components/ProspectDetail";
import AddProspect from "./components/AddProspect";
import TouchpointModal from "./components/TouchpointModal";
import StoredLists from "./components/StoredLists";
import AuthPage from "./components/AuthPage";
import AdminPanel from "./components/AdminPanel";

export default function App() {
  const { tasksToday, hydrated, user, syncing, flushSave } = useStore();

  const VALID_VIEWS = ["home", "list", "analytics", "sequences", "tasks", "stored-lists", "admin"];
  const getHashView = () => {
    const hash = window.location.hash.replace("#", "");
    return VALID_VIEWS.includes(hash) ? hash : "home";
  };

  const [view, setView] = useState(getHashView);
  const [viewParams, setViewParams] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [tpProspectId, setTpProspectId] = useState(null);
  const [navKey, setNavKey] = useState(0);
  const [theme, setTheme] = useState(() => localStorage.getItem("outreach-theme") || "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("outreach-theme", theme);
  }, [theme]);

  // Keep URL hash in sync with current view
  useEffect(() => {
    window.location.hash = view;
  }, [view]);

  // Handle browser back/forward
  useEffect(() => {
    const onHashChange = () => setView(getHashView());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((newView, params = {}) => {
    setView((prev) => {
      // Clicking the active tab refreshes it (bumps navKey regardless)
      return newView;
    });
    setViewParams(params);
    setNavKey((k) => k + 1);
  }, []);

  if (!hydrated) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, background: "var(--bg)" }}>
        <div style={{ fontSize: 28 }}>⚡</div>
        <div style={{ fontSize: 15, color: "var(--text-muted)", fontFamily: "var(--font)" }}>Loading OutreachOS…</div>
      </div>
    );
  }

  // If Supabase is configured and user is not logged in, show auth gate
  if (supabase && !user) {
    return <AuthPage />;
  }

  const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS || "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const isOwner = !!user?.email && adminEmails.includes(user.email.toLowerCase());
  const isAdmin = isOwner || user?.app_metadata?.role === "admin";

  const tabs = [
    { id: "home", label: "🏠 Home" },
    { id: "list", label: "≡ Prospects" },
    { id: "analytics", label: "📊 Analytics" },
    { id: "sequences", label: "⚡ Sequences" },
    { id: "tasks", label: "✅ Tasks", badge: tasksToday.length || null },
    { id: "stored-lists", label: "📋 Lists" },
    ...(isAdmin ? [{ id: "admin", label: "🔑 Admin" }] : []),
  ];

  return (
    <div className="app-layout">
      {/* Header */}
      <header className="header">
        <div className="header-brand" onClick={() => navigate("home")} style={{ cursor: "pointer" }} title="Go to Home">
          <div className="header-icon">⚡</div>
          <div>
            <div className="header-title">OutreachOS</div>
            <div className="header-sub">prospect pipeline tracker</div>
          </div>
        </div>
        <nav className="header-nav">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`tab-btn${view === t.id ? " active" : ""}`}
              onClick={() => navigate(t.id)}
            >
              {t.label}
              {t.badge ? <span className="tab-badge">{t.badge}</span> : null}
            </button>
          ))}
          <button
            className="theme-toggle"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => setTheme((t) => t === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          {user && (
            <div className="flex items-center gap-8" style={{ borderLeft: "1px solid var(--border)", paddingLeft: 12 }}>
              {syncing && <span className="mono" style={{ fontSize: 11, color: "var(--text-dim)" }} title="Syncing to cloud">↑ sync</span>}
              {!syncing && supabase && <span style={{ fontSize: 12, color: "var(--success)", opacity: 0.7 }} title="Saved to cloud">●</span>}
              <span style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={user.email}>
                {user.email}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={async () => { await flushSave(); await supabase?.auth.signOut(); }}
                title="Sign out"
              >
                Sign out
              </button>
            </div>
          )}
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Prospect</button>
        </nav>
      </header>

      {/* Pages */}
      <main className="main">
        {view === "home" && <Home onNavigate={navigate} onSelect={setSelectedId} onLogTouchpoint={setTpProspectId} />}
        {view === "list" && (
          <Prospects
            key={navKey}
            initialFilters={viewParams}
            onSelect={setSelectedId}
            onLogTouchpoint={setTpProspectId}
            onAdd={() => setShowAdd(true)}
          />
        )}
        {view === "analytics" && <Analytics />}
        {view === "sequences" && <Sequences />}
        {view === "tasks" && <Tasks onSelect={setSelectedId} onNavigate={navigate} />}
        {view === "stored-lists" && <StoredLists onNavigate={navigate} onAdd={() => setShowAdd(true)} />}
        {view === "admin" && isAdmin && <AdminPanel />}
      </main>

      {/* Modals */}
      {selectedId != null && (
        <ProspectDetail
          prospectId={selectedId}
          onClose={() => setSelectedId(null)}
          onLogTouchpoint={setTpProspectId}
        />
      )}
      {showAdd && <AddProspect onClose={() => setShowAdd(false)} />}
      {tpProspectId != null && (
        <TouchpointModal
          prospectId={tpProspectId}
          onClose={() => setTpProspectId(null)}
        />
      )}
      <SpeedInsights />
    </div>
  );
}
