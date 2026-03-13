import { useState, useCallback } from "react";
import { useStore } from "./store";
import Home from "./components/Home";
import Prospects from "./components/Prospects";
import Analytics from "./components/Analytics";
import Sequences from "./components/Sequences";
import Tasks from "./components/Tasks";
import ProspectDetail from "./components/ProspectDetail";
import AddProspect from "./components/AddProspect";
import TouchpointModal from "./components/TouchpointModal";
import StoredLists from "./components/StoredLists";

/* ── Profile picker shown when no user is selected ── */
function ProfilePicker() {
  const { state, dispatch } = useStore();
  const [name, setName] = useState("");

  function createUser() {
    const trimmed = name.trim();
    if (!trimmed) return;
    dispatch({ type: "ADD_USER", payload: trimmed });
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 40, width: 380, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>⚡</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Welcome to OutreachOS</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 28 }}>
          Choose a profile to get started. Each user has their own prospect workspace.
        </div>

        {state.users.length > 0 && (
          <>
            <div className="form-label" style={{ marginBottom: 10 }}>Switch to existing profile</div>
            <div className="flex flex-col gap-6" style={{ marginBottom: 24 }}>
              {state.users.map((u) => (
                <button
                  key={u.id}
                  className="btn btn-ghost"
                  style={{ justifyContent: "flex-start", gap: 10, padding: "10px 14px" }}
                  onClick={() => dispatch({ type: "SET_CURRENT_USER", payload: u.id })}
                >
                  <span style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--primary-bg)", border: "1px solid var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "var(--primary-light)", flexShrink: 0 }}>
                    {u.name[0].toUpperCase()}
                  </span>
                  {u.name}
                </button>
              ))}
            </div>
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 20, marginBottom: 12 }} className="form-label">Or create a new profile</div>
          </>
        )}

        {!state.users.length && <div className="form-label" style={{ marginBottom: 10 }}>Your name</div>}

        <div className="flex gap-8">
          <input
            className="form-input"
            style={{ flex: 1 }}
            placeholder="e.g. Alice, Team Sales…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createUser()}
            autoFocus
          />
          <button className="btn btn-primary" onClick={createUser} disabled={!name.trim()} style={!name.trim() ? { opacity: 0.5 } : {}}>
            Go →
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── User avatar / switcher shown in header ── */
function UserBadge() {
  const { state, currentUser, dispatch } = useStore();
  const [open, setOpen] = useState(false);

  if (!currentUser) return null;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "5px 12px 5px 6px", cursor: "pointer", color: "var(--text)", fontSize: 13, fontFamily: "var(--font)" }}
      >
        <span style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--primary-bg)", border: "1px solid var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "var(--primary-light)" }}>
          {currentUser.name[0].toUpperCase()}
        </span>
        {currentUser.name}
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>▾</span>
      </button>

      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, minWidth: 180, boxShadow: "0 4px 20px rgba(0,0,0,0.4)", zIndex: 1000, overflow: "hidden" }}>
          <div style={{ padding: "8px 12px 6px", fontSize: 11, color: "var(--text-dim)", fontWeight: 600, letterSpacing: "0.06em" }}>SWITCH PROFILE</div>
          {state.users.map((u) => (
            <button
              key={u.id}
              onClick={() => { dispatch({ type: "SET_CURRENT_USER", payload: u.id }); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", background: u.id === state.currentUserId ? "var(--primary-bg)" : "transparent", border: "none", color: u.id === state.currentUserId ? "var(--primary-light)" : "var(--text)", fontSize: 13, cursor: "pointer", fontFamily: "var(--font)", textAlign: "left" }}
            >
              <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--primary-bg)", border: `1px solid ${u.id === state.currentUserId ? "var(--primary)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "var(--primary-light)", flexShrink: 0 }}>
                {u.name[0].toUpperCase()}
              </span>
              {u.name}
              {u.id === state.currentUserId && <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--primary)" }}>✓</span>}
            </button>
          ))}
          <div style={{ borderTop: "1px solid var(--border)", padding: "6px 12px 8px" }}>
            <button
              onClick={() => { dispatch({ type: "SET_CURRENT_USER", payload: null }); setOpen(false); }}
              style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 12, cursor: "pointer", fontFamily: "var(--font)", padding: 0 }}
            >
              + Add new profile
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { tasksToday, currentUser } = useStore();
  const [view, setView] = useState("home");
  const [viewParams, setViewParams] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [tpProspectId, setTpProspectId] = useState(null);
  const [navKey, setNavKey] = useState(0);

  const navigate = useCallback((newView, params = {}) => {
    setView(newView);
    setViewParams(params);
    setNavKey((k) => k + 1);
  }, []);

  /* Show profile picker if no user selected — after all hooks */
  if (!currentUser) return <ProfilePicker />;

  const tabs = [
    { id: "home", label: "🏠 Home" },
    { id: "list", label: "≡ Prospects" },
    { id: "analytics", label: "📊 Analytics" },
    { id: "sequences", label: "⚡ Sequences" },
    { id: "tasks", label: "✅ Tasks", badge: tasksToday.length || null },
    { id: "stored-lists", label: "📋 Lists" },
  ];

  return (
    <div className="app-layout">
      {/* Header */}
      <header className="header">
        <div className="header-brand">
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
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Prospect</button>
          <UserBadge />
        </nav>
      </header>

      {/* Pages */}
      <main className="main">
        {view === "home" && <Home onNavigate={navigate} onSelect={setSelectedId} />}
        {view === "list" && (
          <Prospects
            key={navKey}
            initialFilters={viewParams}
            onSelect={setSelectedId}
            onLogTouchpoint={setTpProspectId}
          />
        )}
        {view === "analytics" && <Analytics />}
        {view === "sequences" && <Sequences />}
        {view === "tasks" && <Tasks onSelect={setSelectedId} onNavigate={navigate} />}
        {view === "stored-lists" && <StoredLists onNavigate={navigate} />}
      </main>

      {/* Modals */}
      {selectedId != null && (
        <ProspectDetail
          prospectId={selectedId}
          onClose={() => setSelectedId(null)}
          onLogTouchpoint={setTpProspectId}
          onSelect={setSelectedId}
        />
      )}
      {showAdd && <AddProspect onClose={() => setShowAdd(false)} />}
      {tpProspectId != null && (
        <TouchpointModal
          prospectId={tpProspectId}
          onClose={() => setTpProspectId(null)}
        />
      )}
    </div>
  );
}
