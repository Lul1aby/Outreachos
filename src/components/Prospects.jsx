import { useState, useMemo, useRef, useCallback } from "react";
import { useStore } from "../store";
import { STATUSES, CHANNELS, STATUS_COLORS } from "../constants";
import { daysSinceLast, hoursSinceLast, stalenessColor, stalenessLabel } from "../utils";
import { Badge } from "./ui";

export default function Prospects({ initialFilters = {}, onSelect, onLogTouchpoint }) {
  const { state, dispatch, stats, allLists, overdueProspects, tasksToday } = useStore();
  const { prospects, dismissedReminders } = state;

  /* ── Filter state ── */
  const [search, setSearch] = useState("");
  const searchTimerRef = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStatuses, setFilterStatuses] = useState(initialFilters.statuses || []);
  const [filterChannel, setFilterChannel] = useState(initialFilters.channel || "All");
  const [filterList, setFilterList] = useState(initialFilters.list || "");
  const [filterDateFrom, setFilterDateFrom] = useState(initialFilters.dateFrom || "");
  const [filterDateTo, setFilterDateTo] = useState(initialFilters.dateTo || "");
  const [filterDormant, setFilterDormant] = useState(initialFilters.dormant || "All");
  const [customDays, setCustomDays] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const onSearch = useCallback((val) => {
    setSearch(val);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(val), 300);
  }, []);

  const activeFilterCount = [filterStatuses.length > 0, filterDateFrom || filterDateTo, filterList, filterChannel !== "All", filterDormant !== "All"].filter(Boolean).length;

  const filtered = useMemo(() => {
    return prospects.filter((p) => {
      const q = debouncedSearch.toLowerCase();
      if (q && !(p.name.toLowerCase().includes(q) || p.company.toLowerCase().includes(q) || (p.title || "").toLowerCase().includes(q) || (p.listName || "").toLowerCase().includes(q))) return false;
      if (filterStatuses.length > 0 && !filterStatuses.includes(p.status)) return false;
      if (filterChannel !== "All" && !p.touchpoints.some((t) => t.channel === filterChannel)) return false;
      if (filterList && p.listName !== filterList) return false;
      if (filterDateFrom && p.createdAt < filterDateFrom) return false;
      if (filterDateTo && p.createdAt > filterDateTo) return false;
      if (filterDormant !== "All") {
        const d = daysSinceLast(p);
        const thresh = filterDormant === "custom" ? Number(customDays) : Number(filterDormant);
        if (d === null || d < thresh) return false;
      }
      return true;
    });
  }, [prospects, debouncedSearch, filterStatuses, filterChannel, filterList, filterDateFrom, filterDateTo, filterDormant, customDays]);

  function clearAll() {
    setFilterStatuses([]); setFilterList(""); setFilterDateFrom(""); setFilterDateTo("");
    setFilterChannel("All"); setFilterDormant("All"); setCustomDays("");
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  return (
    <div>
      {/* Stats row */}
      <div className="stat-row">
        {[
          { label: "Total Prospects", val: stats.total, accent: "#6366f1" },
          { label: "Total Touchpoints", val: stats.totalTp, accent: "#8b5cf6" },
          { label: "Reply Rate", val: `${stats.replyRate}%`, accent: "#34d399" },
          { label: "Meetings Booked", val: stats.meetings, accent: "#a78bfa" },
          { label: "Untouched 7d+", val: stats.needsTouch7, accent: "#f97316", filter: "7" },
        ].map((s) => (
          <div
            key={s.label}
            className={`stat-card${s.filter ? " clickable" : ""}${filterDormant === s.filter ? " active" : ""}`}
            onClick={() => s.filter && setFilterDormant((f) => f === s.filter ? "All" : s.filter)}
          >
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.accent }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Overdue banner */}
      {overdueProspects.length > 0 && (
        <div className="overdue-banner">
          <div className="overdue-header">
            <div className="overdue-title">
              <span>⏰</span> {overdueProspects.length} prospect{overdueProspects.length > 1 ? "s" : ""} haven't been touched in 28+ hours
            </div>
            <button onClick={() => dispatch({ type: "DISMISS_ALL_REMINDERS", payload: overdueProspects.map((p) => p.id) })} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 12, cursor: "pointer", fontFamily: "var(--font)" }}>Dismiss all</button>
          </div>
          <div className="overdue-chips">
            {overdueProspects.slice(0, 8).map((p) => {
              const h = hoursSinceLast(p);
              const label = h >= 48 ? `${Math.floor(h / 24)}d ago` : `${h}h ago`;
              return (
                <div key={p.id} className="overdue-chip" onClick={() => onSelect(p.id)}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: "var(--text-sec)" }}>{p.company}</span>
                  <span className="mono" style={{ fontSize: 10, color: "#f97316", background: "#2a1800", borderRadius: 4, padding: "1px 6px" }}>{label}</span>
                  <button onClick={(e) => { e.stopPropagation(); dispatch({ type: "DISMISS_REMINDER", payload: p.id }); }} style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: 14, cursor: "pointer", lineHeight: 1, padding: 0 }}>×</button>
                </div>
              );
            })}
            {overdueProspects.length > 8 && <span style={{ fontSize: 12, color: "var(--text-muted)", alignSelf: "center" }}>+{overdueProspects.length - 8} more</span>}
          </div>
        </div>
      )}

      {/* Search + filter toggle */}
      <div className="filter-bar">
        <input className="filter-input" value={search} onChange={(e) => onSearch(e.target.value)} placeholder="🔍  Search name, company, title, list…" />
        <button className={`filter-toggle${showFilters || activeFilterCount > 0 ? " active" : ""}`} onClick={() => setShowFilters((f) => !f)}>
          <span>⚙ Filters</span>
          {activeFilterCount > 0 && <span style={{ background: "var(--primary)", color: "#fff", borderRadius: 10, padding: "0 7px", fontSize: 11, fontWeight: 700 }}>{activeFilterCount}</span>}
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{showFilters ? "▲" : "▼"}</span>
        </button>
        {/* Active filter pills */}
        {filterStatuses.map((s) => (
          <div key={s} className="filter-pill">{s}<button onClick={() => setFilterStatuses((p) => p.filter((x) => x !== s))}>×</button></div>
        ))}
        {filterList && <div className="filter-pill" style={{ background: "#0d1a2e", borderColor: "#1e3a5f", color: "#60a5fa" }}>📋 {filterList}<button onClick={() => setFilterList("")}>×</button></div>}
        {(filterDateFrom || filterDateTo) && <div className="filter-pill" style={{ background: "#0d2a1a", borderColor: "#1e5f3a", color: "#34d399" }}>📅 {filterDateFrom || "…"} → {filterDateTo || "…"}<button onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); }}>×</button></div>}
        {activeFilterCount > 0 && <button className="btn btn-sm" style={{ borderRadius: 20, border: "1px solid var(--input-border)", background: "transparent", color: "var(--text-muted)" }} onClick={clearAll}>✕ Clear all</button>}
      </div>

      {/* Advanced filter panel */}
      {showFilters && (
        <div className="filter-panel">
          <div className="filter-grid">
            {/* Status */}
            <div>
              <div className="form-label" style={{ marginBottom: 10 }}>Status</div>
              <div className="flex flex-col gap-6">
                {STATUSES.map((s) => {
                  const c = STATUS_COLORS[s];
                  const checked = filterStatuses.includes(s);
                  return (
                    <label key={s} className="checkbox-row" onClick={() => setFilterStatuses((prev) => checked ? prev.filter((x) => x !== s) : [...prev, s])}>
                      <div className={`checkbox-box${checked ? " checked" : ""}`} style={{ borderColor: checked ? c.border : undefined, background: checked ? c.bg : undefined }}>
                        {checked && <span style={{ color: c.text, fontSize: 10 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 12, color: checked ? c.text : "var(--text-sec)", flex: 1 }}>{s}</span>
                      <span className="mono" style={{ fontSize: 10, color: "var(--text-dim)" }}>{prospects.filter((p) => p.status === s).length}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            {/* Date range */}
            <div>
              <div className="form-label" style={{ marginBottom: 10 }}>Date Added</div>
              <div className="flex flex-col gap-10">
                <div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 5 }}>From</div>
                  <input type="date" className="form-input" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} style={{ colorScheme: "dark" }} />
                </div>
                <div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 5 }}>To</div>
                  <input type="date" className="form-input" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} style={{ colorScheme: "dark" }} />
                </div>
                <div className="flex gap-6 flex-wrap">
                  {[{ label: "Last 7d", d: 7 }, { label: "Last 30d", d: 30 }, { label: "Last 90d", d: 90 }].map((q) => {
                    const from = new Date(Date.now() - q.d * 86400000).toISOString().slice(0, 10);
                    return <button key={q.label} className="dormant-chip" style={filterDateFrom === from && !filterDateTo ? { borderColor: "var(--primary)", color: "var(--primary-light)", background: "var(--primary-bg)" } : {}} onClick={() => { setFilterDateFrom(from); setFilterDateTo(""); }}>{q.label}</button>;
                  })}
                </div>
              </div>
            </div>
            {/* List + Channel */}
            <div>
              <div className="form-label" style={{ marginBottom: 10 }}>List Name</div>
              {allLists.length === 0 && <div style={{ fontSize: 12, color: "var(--text-dim)", fontStyle: "italic" }}>No lists yet</div>}
              <div className="flex flex-col gap-6 mb-16">
                {allLists.map((l) => (
                  <label key={l} className="checkbox-row" onClick={() => setFilterList(filterList === l ? "" : l)} style={{ padding: "6px 10px", borderRadius: 7, background: filterList === l ? "#0d1a2e" : "transparent", border: `1px solid ${filterList === l ? "#1e3a5f" : "transparent"}` }}>
                    <div className={`checkbox-box${filterList === l ? " checked" : ""}`} style={filterList === l ? { borderColor: "#3b82f6", background: "#1e3a5f" } : {}}>
                      {filterList === l && <span style={{ color: "#60a5fa", fontSize: 10 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 12, color: filterList === l ? "#93c5fd" : "var(--text-sec)", flex: 1 }}>📋 {l}</span>
                    <span className="mono" style={{ fontSize: 10, color: "var(--text-dim)" }}>{prospects.filter((p) => p.listName === l).length}</span>
                  </label>
                ))}
              </div>
              <div className="form-label" style={{ marginBottom: 10 }}>Channel Used</div>
              <select className="form-select" value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)}>
                <option value="All">All Channels</option>
                {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Dormant chips */}
      <div className="dormant-bar">
        <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)", marginRight: 4, whiteSpace: "nowrap" }}>UNTOUCHED:</span>
        {[{ key: "All", label: "Show All" }, { key: "7", label: "7d+" }, { key: "15", label: "15d+" }, { key: "30", label: "30d+" }].map((opt) => {
          const count = opt.key === "All" ? null : prospects.filter((p) => { const d = daysSinceLast(p); return d !== null && d >= Number(opt.key); }).length;
          return (
            <button key={opt.key} className={`dormant-chip${filterDormant === opt.key ? " active" : ""}`} onClick={() => { setFilterDormant(opt.key); setCustomDays(""); }}>
              {opt.label}
              {count !== null && <span className={`dormant-count${filterDormant === opt.key ? " active" : ""}`} style={{ background: filterDormant === opt.key ? "#2a1800" : "var(--border)", color: filterDormant === opt.key ? "#f97316" : "var(--text-muted)" }}>{count}</span>}
            </button>
          );
        })}
        <div className="flex items-center" style={{ background: "var(--surface)", border: `1px solid ${filterDormant === "custom" ? "var(--warning-alt)" : "var(--input-border)"}`, borderRadius: 20, overflow: "hidden" }}>
          <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)", paddingLeft: 12 }}>Custom:</span>
          <input type="number" min="1" max="365" value={customDays} placeholder="e.g. 45" onChange={(e) => { setCustomDays(e.target.value); setFilterDormant(e.target.value && Number(e.target.value) > 0 ? "custom" : "All"); }} style={{ width: 64, background: "transparent", border: "none", padding: "5px 6px", color: "var(--text)", fontSize: 12, outline: "none", fontFamily: "var(--mono)" }} />
          <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)", paddingRight: 12 }}>days+</span>
        </div>
        {filterDormant !== "All" && <button className="dormant-chip" onClick={() => { setFilterDormant("All"); setCustomDays(""); }}>✕ Clear</button>}
        <span className="mono ml-auto" style={{ fontSize: 12, color: "var(--text-dim)" }}>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div style={{ padding: "0 32px 32px" }}>
        {selectedIds.size > 0 && (
          <div className="select-bar">
            <span style={{ fontSize: 13, color: "var(--primary-light)", fontWeight: 600 }}>{selectedIds.size} selected</span>
            <button className="btn btn-success btn-sm" onClick={() => { dispatch({ type: "COMPLETE_ALL_FOR_PROSPECTS", payload: [...selectedIds] }); setSelectedIds(new Set()); }}>⚡ Complete All Tasks</button>
            <button className="btn btn-sm" style={{ background: "#2a1e1e", border: "1px solid #991b1b", color: "#f87171" }} onClick={() => { if (window.confirm(`Delete ${selectedIds.size} prospect${selectedIds.size > 1 ? "s" : ""}? This cannot be undone.`)) { dispatch({ type: "DELETE_PROSPECTS", payload: [...selectedIds] }); setSelectedIds(new Set()); } }}>🗑 Delete Selected</button>
            <button style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 12, cursor: "pointer", fontFamily: "var(--font)" }} onClick={() => setSelectedIds(new Set())}>✕ Clear</button>
            <span className="mono ml-auto" style={{ fontSize: 11, color: "var(--text-dim)" }}>Marks all pending sequence tasks as done</span>
          </div>
        )}

        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 32, padding: "12px 8px" }}>
                <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={(e) => setSelectedIds(e.target.checked ? new Set(filtered.map((p) => p.id)) : new Set())} style={{ cursor: "pointer", accentColor: "var(--primary)" }} />
              </th>
              {["Prospect", "Company / List", "Status", "Last Activity", "Contact", ""].map((h) => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const days = daysSinceLast(p);
              const hours = hoursSinceLast(p);
              const sc = stalenessColor(days);
              const sl = stalenessLabel(days);
              const isSelected = selectedIds.has(p.id);
              const pendingCount = tasksToday.filter((t) => t.prospect.id === p.id).length;
              return (
                <tr key={p.id} className={isSelected ? "selected" : ""} onClick={() => onSelect(p.id)}>
                  <td onClick={(e) => { e.stopPropagation(); toggleSelected(p.id); }} style={{ padding: "14px 8px" }}>
                    <input type="checkbox" checked={isSelected} readOnly style={{ cursor: "pointer", accentColor: "var(--primary)" }} />
                  </td>
                  <td>
                    <div className="flex items-center gap-6">
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: sc, flexShrink: 0, boxShadow: days !== null && days >= 7 ? `0 0 6px ${sc}` : "none" }} />
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                      {hours !== null && hours >= 28 && !dismissedReminders.includes(p.id) && <span className="mono" style={{ fontSize: 10, background: "#2a1800", color: "#f97316", borderRadius: 4, padding: "1px 5px" }}>⏰</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, paddingLeft: 12 }}>{p.title}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13, color: "var(--text-sec)" }}>{p.company}</div>
                    {p.listName && <div onClick={(e) => { e.stopPropagation(); setFilterList(p.listName); }} style={{ fontSize: 11, color: "#3b82f6", marginTop: 2, cursor: "pointer" }}>📋 {p.listName}</div>}
                  </td>
                  <td><Badge status={p.status} /></td>
                  <td><span className="mono" style={{ fontSize: 12, color: sc, fontWeight: days !== null && days >= 7 ? 600 : 400 }}>{sl}</span></td>
                  <td>
                    <div className="flex flex-col gap-4">
                      {p.email && <a href={`mailto:${p.email}`} onClick={(e) => e.stopPropagation()} className="contact-link contact-link-email" title={p.email}>✉️ <span className="truncate">{p.email}</span></a>}
                      {p.phone && <a href={`tel:${p.phone}`} onClick={(e) => e.stopPropagation()} className="contact-link contact-link-phone" title={p.phone}>📞 {p.phone}</a>}
                      {!p.email && !p.phone && <span style={{ fontSize: 11, color: "var(--text-dim)" }}>—</span>}
                    </div>
                  </td>
                  <td>
                    <div className="flex gap-6 items-center">
                      {pendingCount > 0 && (
                        <button title={`Complete all ${pendingCount} pending tasks`} onClick={(e) => { e.stopPropagation(); dispatch({ type: "COMPLETE_ALL_FOR_PROSPECTS", payload: [p.id] }); }} className="btn btn-success btn-sm btn-icon" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          ⚡ <span className="mono">{pendingCount}</span>
                        </button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); onLogTouchpoint(p.id); }} className="btn btn-ghost btn-sm">+ Log</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="empty" style={{ paddingTop: 48 }}>No prospects found. Add one to get started.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
