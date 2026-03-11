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

export default function App() {
  const { tasksToday } = useStore();
  const [view, setView] = useState("home");
  const [viewParams, setViewParams] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [tpProspectId, setTpProspectId] = useState(null);
  /* Use a key to force Prospects remount when navigating with params */
  const [navKey, setNavKey] = useState(0);

  const navigate = useCallback((newView, params = {}) => {
    setView(newView);
    setViewParams(params);
    setNavKey((k) => k + 1);
  }, []);

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
