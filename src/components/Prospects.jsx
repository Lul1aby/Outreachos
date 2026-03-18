import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../store";
import { supabase } from "../supabase";
import { STATUSES, CHANNELS, INDUSTRIES, STATUS_COLORS, CHANNEL_ICONS } from "../constants";
import { daysSinceLast, hoursSinceLast, stalenessColor, stalenessLabel, isTerminalStatus } from "../utils";
import { Badge } from "./ui";

/* ── Inline research brief renderer (same as ProspectDetail) ── */
function RenderBrief({ text }) {
  const lines = text.split("\n");
  return (
    <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-sec)" }}>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} style={{ height: 4 }} />;
        if (/^\*\*[^*]+\*\*$/.test(trimmed)) {
          return <div key={i} style={{ fontWeight: 700, color: "var(--text)", marginTop: 10, marginBottom: 2, fontSize: 13 }}>{trimmed.replace(/\*\*/g, "")}</div>;
        }
        if (/^[-•*]\s/.test(trimmed)) {
          const content = trimmed.replace(/^[-•*]\s/, "").replace(/\*\*(.+?)\*\*/g, "BOLD_START$1BOLD_END");
          const parts = content.split(/(BOLD_START|BOLD_END)/);
          let bold = false;
          return (
            <div key={i} style={{ display: "flex", gap: 5, marginBottom: 2 }}>
              <span style={{ color: "var(--primary-light)", flexShrink: 0 }}>›</span>
              <span>{parts.map((p, j) => { if (p === "BOLD_START") { bold = true; return null; } if (p === "BOLD_END") { bold = false; return null; } return bold ? <strong key={j} style={{ color: "var(--text)" }}>{p}</strong> : p; })}</span>
            </div>
          );
        }
        return <div key={i} style={{ marginBottom: 2 }}>{trimmed}</div>;
      })}
    </div>
  );
}

export default function Prospects({ initialFilters = {}, onSelect, onLogTouchpoint, onAdd }) {
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
  const [copied, setCopied] = useState(null);
  const [taskPopover, setTaskPopover] = useState(null);
  const taskPopoverRef = useRef(null);
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [filterDuplicates, setFilterDuplicates] = useState(false);
  const [dupeMap, setDupeMap] = useState({});
  const [checkingDupes, setCheckingDupes] = useState(false);
  const dupeCheckDone = useRef(false);

  /* ── NEW: CRM-grade filters ── */
  const [filterIndustries, setFilterIndustries] = useState([]);
  const [filterCompany, setFilterCompany] = useState("");
  const [filterTouchpoints, setFilterTouchpoints] = useState("All"); // "All"|"0"|"1-3"|"4-6"|"7+"
  const [filterHasEmail, setFilterHasEmail] = useState(false);
  const [filterHasPhone, setFilterHasPhone] = useState(false);

  /* ── Company view toggle + independent company-level filters ── */
  const [groupByCompany, setGroupByCompany] = useState(false);
  const [expandedCompanies, setExpandedCompanies] = useState(new Set());
  const [researchingCompany, setResearchingCompany] = useState(null);
  const [researchErrors, setResearchErrors] = useState({});
  const [cvFilterCompany, setCvFilterCompany] = useState("");
  const [cvFilterIndustries, setCvFilterIndustries] = useState([]);
  const [cvFilterStatuses, setCvFilterStatuses] = useState([]); // filter companies that have at least one prospect with this status
  const [cvSearch, setCvSearch] = useState("");
  const cvSearchTimerRef = useRef(null);
  const [cvDebouncedSearch, setCvDebouncedSearch] = useState("");

  /* Check all prospects against system for cross-user duplicates */
  const checkForDuplicates = useCallback(async () => {
    if (prospects.length === 0) return;
    setCheckingDupes(true);
    try {
      const session = await supabase?.auth.getSession();
      const token = session?.data?.session?.access_token;
      const res = await fetch("/api/check-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ prospects: prospects.map((p) => ({ email: p.email, phone: p.phone, linkedin: p.linkedin, name: p.name, company: p.company })) }),
      });
      if (res.ok) {
        const body = await res.json();
        const map = {};
        (body.matches || []).forEach((m) => {
          const prospect = prospects[m.inputIndex];
          if (prospect) {
            map[prospect.id] = { field: m.field, value: m.value, matchedName: m.matchedName, matchedCompany: m.matchedCompany, ownerEmail: m.ownerEmail };
          }
        });
        setDupeMap(map);
      }
    } catch { /* fail silently */ }
    finally { setCheckingDupes(false); dupeCheckDone.current = true; }
  }, [prospects]);

  useEffect(() => {
    if (!dupeCheckDone.current && prospects.length > 0 && supabase) {
      checkForDuplicates();
    }
  }, [prospects.length, checkForDuplicates]);

  useEffect(() => {
    if (!taskPopover) return;
    const close = (e) => {
      if (taskPopoverRef.current && !taskPopoverRef.current.contains(e.target)) setTaskPopover(null);
    };
    const closeScroll = () => setTaskPopover(null);
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", closeScroll, true);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("scroll", closeScroll, true); };
  }, [taskPopover]);

  const toggleSort = useCallback((col) => {
    setSortBy((prev) => {
      if (prev === col) { setSortDir((d) => d === "asc" ? "desc" : "asc"); return col; }
      setSortDir("asc"); return col;
    });
  }, []);

  const copyContact = useCallback((e, text, id, field) => {
    e.stopPropagation();
    e.preventDefault();
    navigator.clipboard.writeText(text).then(() => {
      setCopied({ id, field });
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => {});
  }, []);

  const onSearch = useCallback((val) => {
    setSearch(val);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(val), 300);
  }, []);

  const onCvSearch = useCallback((val) => {
    setCvSearch(val);
    clearTimeout(cvSearchTimerRef.current);
    cvSearchTimerRef.current = setTimeout(() => setCvDebouncedSearch(val), 300);
  }, []);

  /* ── NEW: Fetch company research ── */
  const fetchCompanyResearch = useCallback(async (company, industry) => {
    setResearchingCompany(company);
    setResearchErrors((prev) => { const n = { ...prev }; delete n[company]; return n; });
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, industry }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Research failed");
      // Save to all prospects of this company
      const companyProspects = prospects.filter((p) => p.company === company);
      companyProspects.forEach((p) => {
        dispatch({ type: "UPDATE_PROSPECT", payload: { id: p.id, updates: { research: { brief: data.brief, fetchedAt: new Date().toLocaleTimeString() } } } });
      });
    } catch (err) {
      setResearchErrors((prev) => ({ ...prev, [company]: err.message }));
    } finally {
      setResearchingCompany(null);
    }
  }, [prospects, dispatch]);

  const deleteCompanyResearch = useCallback((company) => {
    const companyProspects = prospects.filter((p) => p.company === company);
    companyProspects.forEach((p) => {
      dispatch({ type: "UPDATE_PROSPECT", payload: { id: p.id, updates: { research: null } } });
    });
  }, [prospects, dispatch]);

  const changeCompanyIndustry = useCallback((company, industry) => {
    const companyProspects = prospects.filter((p) => p.company === company);
    companyProspects.forEach((p) => {
      dispatch({ type: "UPDATE_PROSPECT", payload: { id: p.id, updates: { industry } } });
    });
  }, [prospects, dispatch]);

  const toggleCompanyExpand = useCallback((company) => {
    setExpandedCompanies((prev) => {
      const n = new Set(prev);
      n.has(company) ? n.delete(company) : n.add(company);
      return n;
    });
  }, []);

  const dupeCount = Object.keys(dupeMap).length;
  const activeFilterCount = [
    filterStatuses.length > 0, filterDateFrom || filterDateTo, filterList,
    filterChannel !== "All", filterDormant !== "All", filterDuplicates,
    filterIndustries.length > 0, filterCompany, filterTouchpoints !== "All",
    filterHasEmail, filterHasPhone,
  ].filter(Boolean).length;
  const cvActiveFilterCount = [
    cvFilterCompany, cvFilterIndustries.length > 0, cvFilterStatuses.length > 0,
  ].filter(Boolean).length;

  /* ── All industries present in data ── */
  const allIndustries = useMemo(() => {
    const set = new Set(prospects.map((p) => p.industry).filter(Boolean));
    // Include constants too
    INDUSTRIES.forEach((i) => set.add(i));
    return [...set].sort();
  }, [prospects]);

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
      if (filterDuplicates && !dupeMap[p.id]) return false;
      // NEW filters
      if (filterIndustries.length > 0 && !filterIndustries.includes(p.industry || "")) return false;
      if (filterCompany && !p.company.toLowerCase().includes(filterCompany.toLowerCase())) return false;
      if (filterTouchpoints !== "All") {
        const tc = p.touchpoints.length;
        if (filterTouchpoints === "0" && tc !== 0) return false;
        if (filterTouchpoints === "1-3" && (tc < 1 || tc > 3)) return false;
        if (filterTouchpoints === "4-6" && (tc < 4 || tc > 6)) return false;
        if (filterTouchpoints === "7+" && tc < 7) return false;
      }
      if (filterHasEmail && !p.email) return false;
      if (filterHasPhone && !p.phone) return false;
      return true;
    });
  }, [prospects, debouncedSearch, filterStatuses, filterChannel, filterList, filterDateFrom, filterDateTo, filterDormant, customDays, filterDuplicates, dupeMap, filterIndustries, filterCompany, filterTouchpoints, filterHasEmail, filterHasPhone]);

  const sorted = useMemo(() => {
    if (!sortBy) return filtered;
    return [...filtered].sort((a, b) => {
      let av, bv;
      if (sortBy === "name")     { av = a.name.toLowerCase();    bv = b.name.toLowerCase(); }
      if (sortBy === "company")  { av = a.company.toLowerCase(); bv = b.company.toLowerCase(); }
      if (sortBy === "title")    { av = (a.title || "").toLowerCase(); bv = (b.title || "").toLowerCase(); }
      if (sortBy === "status")   { av = a.status; bv = b.status; }
      if (sortBy === "activity") {
        const da = daysSinceLast(a); const db = daysSinceLast(b);
        av = da === null ? 9999 : da; bv = db === null ? 9999 : db;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortBy, sortDir]);

  /* ── Group by company — uses independent company-level filters ── */
  const companyGroups = useMemo(() => {
    if (!groupByCompany) return null;
    // In company view, group ALL prospects (not the prospect-filtered list)
    const map = new Map();
    prospects.forEach((p) => {
      const key = p.company || "Unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    });
    let groups = [...map.entries()];

    // Apply company-level filters
    if (cvDebouncedSearch) {
      const q = cvDebouncedSearch.toLowerCase();
      groups = groups.filter(([company, companyProspects]) =>
        company.toLowerCase().includes(q) ||
        companyProspects.some((p) => p.name.toLowerCase().includes(q) || (p.title || "").toLowerCase().includes(q))
      );
    }
    if (cvFilterCompany) {
      const q = cvFilterCompany.toLowerCase();
      groups = groups.filter(([company]) => company.toLowerCase().includes(q));
    }
    if (cvFilterIndustries.length > 0) {
      groups = groups.filter(([, companyProspects]) =>
        companyProspects.some((p) => cvFilterIndustries.includes(p.industry || ""))
      );
    }
    if (cvFilterStatuses.length > 0) {
      groups = groups.filter(([, companyProspects]) =>
        companyProspects.some((p) => cvFilterStatuses.includes(p.status))
      );
    }

    // Sort groups by count (largest first)
    return groups.sort((a, b) => b[1].length - a[1].length);
  }, [prospects, groupByCompany, cvDebouncedSearch, cvFilterCompany, cvFilterIndustries, cvFilterStatuses]);

  function clearAll() {
    setFilterStatuses([]); setFilterList(""); setFilterDateFrom(""); setFilterDateTo("");
    setFilterChannel("All"); setFilterDormant("All"); setCustomDays(""); setFilterDuplicates(false);
    setFilterIndustries([]); setFilterCompany(""); setFilterTouchpoints("All");
    setFilterHasEmail(false); setFilterHasPhone(false);
  }

  function cvClearAll() {
    setCvFilterCompany(""); setCvFilterIndustries([]); setCvFilterStatuses([]);
    setCvSearch(""); setCvDebouncedSearch("");
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  /* ── Render a prospect table row ── */
  function renderRow(p) {
    const days = daysSinceLast(p);
    const hours = hoursSinceLast(p);
    const sc = stalenessColor(days);
    const sl = stalenessLabel(days);
    const isSelected = selectedIds.has(p.id);
    const pendingCount = tasksToday.filter((t) => t.prospect.id === p.id).length;
    const dupeInfo = dupeMap[p.id];
    return (
      <tr key={p.id} className={isSelected ? "selected" : ""} onClick={() => onSelect(p.id)} style={dupeInfo ? { background: "rgba(239,68,68,0.04)" } : undefined}>
        <td onClick={(e) => { e.stopPropagation(); toggleSelected(p.id); }} style={{ padding: "14px 8px" }}>
          <input type="checkbox" checked={isSelected} readOnly style={{ cursor: "pointer", accentColor: "var(--primary)" }} />
        </td>
        <td>
          <div className="flex items-center gap-6">
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: sc, flexShrink: 0, boxShadow: days !== null && days >= 7 ? `0 0 6px ${sc}` : "none" }} />
            <div style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</div>
            {dupeInfo && (
              <span title={`Duplicate ${dupeInfo.field} — matches ${dupeInfo.matchedName} at ${dupeInfo.matchedCompany} (${dupeInfo.ownerEmail})`}
                style={{ fontSize: 11, borderRadius: 20, padding: "1px 8px", background: "var(--danger-bg-deep)", border: "1px solid var(--danger-border)", color: "var(--danger)", whiteSpace: "nowrap" }}>
                🚨 duplicate
              </span>
            )}
            {hours !== null && hours >= 28 && !isTerminalStatus(p) && !dismissedReminders.includes(p.id) && <span className="mono" style={{ fontSize: 14, background: "var(--warning-bg)", color: "var(--warning-alt)", borderRadius: 4, padding: "1px 5px" }}>⏰</span>}
          </div>
          {dupeInfo && (
            <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 2, paddingLeft: 12 }}>
              Matches <strong>{dupeInfo.matchedName}</strong> at {dupeInfo.matchedCompany} ({dupeInfo.ownerEmail}) by {dupeInfo.field}
            </div>
          )}
          {!dupeInfo && <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 2, paddingLeft: 12 }}>{p.title}</div>}
        </td>
        {!groupByCompany && (
          <td>
            <div style={{ fontSize: 14, color: "var(--text-sec)" }}>{p.company}</div>
            {p.listName && <div onClick={(e) => { e.stopPropagation(); setFilterList(p.listName); }} style={{ fontSize: 14, color: "var(--info-light)", marginTop: 2, cursor: "pointer" }}>📋 {p.listName}</div>}
          </td>
        )}
        <td><Badge status={p.status} /></td>
        <td><span className="mono" style={{ fontSize: 14, color: sc, fontWeight: days !== null && days >= 7 ? 600 : 400 }}>{sl}</span></td>
        <td>
          <div className="flex flex-col gap-4">
            {p.email && (
              <button onClick={(e) => copyContact(e, p.email, p.id, "email")} className="contact-link contact-link-email" title="Click to copy email">
                ✉️ <span className="truncate">{p.email}</span>
                {copied?.id === p.id && copied?.field === "email" && <span style={{ fontSize: 12, color: "var(--success)", marginLeft: 4 }}>✓</span>}
              </button>
            )}
            {p.phone && (
              <button onClick={(e) => copyContact(e, p.phone, p.id, "phone")} className="contact-link contact-link-phone" title="Click to copy phone">
                📞 {p.phone}
                {copied?.id === p.id && copied?.field === "phone" && <span style={{ fontSize: 12, color: "var(--success)", marginLeft: 4 }}>✓</span>}
              </button>
            )}
            {!p.email && !p.phone && <span style={{ fontSize: 14, color: "var(--text-dim)" }}>—</span>}
          </div>
        </td>
        <td>
          <div className="flex gap-6 items-center">
            {pendingCount > 0 && (
              <button title={`View ${pendingCount} pending task${pendingCount > 1 ? "s" : ""}`} onClick={(e) => {
                e.stopPropagation();
                if (taskPopover?.id === p.id) { setTaskPopover(null); return; }
                const rect = e.currentTarget.getBoundingClientRect();
                const popH = 280, popW = 300;
                const flippedTop = rect.bottom + popH > window.innerHeight;
                const top = flippedTop ? rect.top - popH - 6 : rect.bottom + 6;
                const left = Math.min(rect.right, window.innerWidth - popW - 8);
                setTaskPopover({ id: p.id, top: Math.max(8, top), left });
              }} className="btn btn-success btn-sm btn-icon" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                ⚡ <span className="mono">{pendingCount}</span>
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); onLogTouchpoint(p.id); }} className="btn btn-ghost btn-sm">+ Log</button>
          </div>
        </td>
      </tr>
    );
  }

  /* ── Table header columns ── */
  const tableHeaders = [
    { label: "Prospect", col: "name" },
    ...(!groupByCompany ? [{ label: "Company / List", col: "company" }] : []),
    { label: "Status", col: "status" },
    { label: "Last Activity", col: "activity" },
    { label: "Contact", col: null },
    { label: "", col: null },
  ];

  const colCount = tableHeaders.length + 1; // +1 for checkbox

  return (
    <div>
      {/* Stats row */}
      <div className="stat-row">
        {[
          { label: "Total Prospects", val: stats.total, accent: "var(--primary)" },
          { label: "Total Touchpoints", val: stats.totalTp, accent: "var(--accent)" },
          { label: "Reply Rate", val: `${stats.replyRate}%`, accent: "var(--success)" },
          { label: "Meetings Booked", val: stats.meetings, accent: "var(--accent)" },
          { label: "Untouched 7d+", val: stats.needsTouch7, accent: "var(--warning-alt)", filter: "7" },
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

      {/* Duplicates banner */}
      {dupeCount > 0 && (
        <div style={{ margin: "0 32px 16px", background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--danger)" }}>
              🚨 {dupeCount} prospect{dupeCount !== 1 ? "s" : ""} already exist{dupeCount === 1 ? "s" : ""} in another user's account
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-sm" onClick={() => setFilterDuplicates((f) => !f)}
                style={{ fontSize: 12, background: filterDuplicates ? "var(--danger-border)" : "transparent", border: "1px solid var(--danger-border)", color: "var(--danger)" }}>
                {filterDuplicates ? "Show all" : "Show duplicates only"}
              </button>
              <button className="btn btn-sm" onClick={checkForDuplicates} disabled={checkingDupes}
                style={{ fontSize: 12, background: "transparent", border: "1px solid var(--danger-border)", color: "var(--danger)" }}>
                {checkingDupes ? "Checking…" : "↻ Recheck"}
              </button>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--danger)", opacity: 0.8 }}>
            These prospects match records owned by other team members. Consider deleting them to avoid duplicate outreach.
          </div>
        </div>
      )}

      {/* Overdue banner */}
      {overdueProspects.length > 0 && (
        <div className="overdue-banner">
          <div className="overdue-header">
            <div className="overdue-title">
              <span>⏰</span> {overdueProspects.length} prospect{overdueProspects.length > 1 ? "s" : ""} haven't been touched in 28+ hours
            </div>
            <button onClick={() => dispatch({ type: "DISMISS_ALL_REMINDERS", payload: overdueProspects.map((p) => p.id) })} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 14, cursor: "pointer", fontFamily: "var(--font)" }}>Dismiss all</button>
          </div>
          <div className="overdue-chips">
            {overdueProspects.slice(0, 8).map((p) => {
              const h = hoursSinceLast(p);
              const label = h >= 48 ? `${Math.floor(h / 24)}d ago` : `${h}h ago`;
              return (
                <div key={p.id} className="overdue-chip" onClick={() => onSelect(p.id)}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>
                  <span style={{ fontSize: 14, color: "var(--text-sec)" }}>{p.company}</span>
                  <span className="mono" style={{ fontSize: 14, color: "var(--warning-alt)", background: "var(--warning-bg)", borderRadius: 4, padding: "1px 6px" }}>{label}</span>
                  <button onClick={(e) => { e.stopPropagation(); dispatch({ type: "DISMISS_REMINDER", payload: p.id }); }} style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: 15, cursor: "pointer", lineHeight: 1, padding: 0 }}>×</button>
                </div>
              );
            })}
            {overdueProspects.length > 8 && <span style={{ fontSize: 14, color: "var(--text-muted)", alignSelf: "center" }}>+{overdueProspects.length - 8} more</span>}
          </div>
        </div>
      )}

      {/* Search + filter toggle + group toggle */}
      <div className="filter-bar">
        {groupByCompany ? (
          /* ── Company view: independent search + filters ── */
          <>
            <input className="filter-input" value={cvSearch} onChange={(e) => onCvSearch(e.target.value)} placeholder="🔍  Search company, prospect name, title…" />
            <button
              className={`filter-toggle active`}
              onClick={() => setGroupByCompany(false)}
              title="Switch to prospect list view"
            >
              <span>🏢 Company View</span>
            </button>
            <button className={`filter-toggle${showFilters || cvActiveFilterCount > 0 ? " active" : ""}`} onClick={() => setShowFilters((f) => !f)}>
              <span>⚙ Filters</span>
              {cvActiveFilterCount > 0 && <span style={{ background: "var(--primary)", color: "#fff", borderRadius: 10, padding: "0 7px", fontSize: 14, fontWeight: 700 }}>{cvActiveFilterCount}</span>}
              <span style={{ fontSize: 14, color: "var(--text-muted)" }}>{showFilters ? "▲" : "▼"}</span>
            </button>
            {/* Company view filter pills */}
            {cvFilterIndustries.map((ind) => (
              <div key={ind} className="filter-pill" style={{ background: "#1e1b4b", borderColor: "#4338ca", color: "#818cf8" }}>{ind}<button onClick={() => setCvFilterIndustries((p) => p.filter((x) => x !== ind))}>×</button></div>
            ))}
            {cvFilterCompany && <div className="filter-pill" style={{ background: "#1a1a2e", borderColor: "#4338ca", color: "#a78bfa" }}>🏢 {cvFilterCompany}<button onClick={() => setCvFilterCompany("")}>×</button></div>}
            {cvFilterStatuses.map((s) => (
              <div key={s} className="filter-pill">{s}<button onClick={() => setCvFilterStatuses((p) => p.filter((x) => x !== s))}>×</button></div>
            ))}
            {cvActiveFilterCount > 0 && <button className="btn btn-sm" style={{ borderRadius: 20, border: "1px solid var(--input-border)", background: "transparent", color: "var(--text-muted)" }} onClick={cvClearAll}>✕ Clear all</button>}
          </>
        ) : (
          /* ── Prospect view: original search + filters ── */
          <>
            <input className="filter-input" value={search} onChange={(e) => onSearch(e.target.value)} placeholder="🔍  Search name, company, title, list…" />
            <button
              className="filter-toggle"
              onClick={() => setGroupByCompany(true)}
              title="Group prospects by company — view research alongside outreach"
            >
              <span>🏢 Company View</span>
            </button>
            <button className={`filter-toggle${showFilters || activeFilterCount > 0 ? " active" : ""}`} onClick={() => setShowFilters((f) => !f)}>
              <span>⚙ Filters</span>
              {activeFilterCount > 0 && <span style={{ background: "var(--primary)", color: "#fff", borderRadius: 10, padding: "0 7px", fontSize: 14, fontWeight: 700 }}>{activeFilterCount}</span>}
              <span style={{ fontSize: 14, color: "var(--text-muted)" }}>{showFilters ? "▲" : "▼"}</span>
            </button>
            {/* Prospect view filter pills */}
            {filterStatuses.map((s) => (
              <div key={s} className="filter-pill">{s}<button onClick={() => setFilterStatuses((p) => p.filter((x) => x !== s))}>×</button></div>
            ))}
            {filterIndustries.map((ind) => (
              <div key={ind} className="filter-pill" style={{ background: "#1e1b4b", borderColor: "#4338ca", color: "#818cf8" }}>{ind}<button onClick={() => setFilterIndustries((p) => p.filter((x) => x !== ind))}>×</button></div>
            ))}
            {filterCompany && <div className="filter-pill" style={{ background: "#1a1a2e", borderColor: "#4338ca", color: "#a78bfa" }}>🏢 {filterCompany}<button onClick={() => setFilterCompany("")}>×</button></div>}
            {filterTouchpoints !== "All" && <div className="filter-pill" style={{ background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success)" }}>📊 {filterTouchpoints} touches<button onClick={() => setFilterTouchpoints("All")}>×</button></div>}
            {filterHasEmail && <div className="filter-pill" style={{ background: "#1a1a2e", borderColor: "#4338ca", color: "#818cf8" }}>✉️ Has Email<button onClick={() => setFilterHasEmail(false)}>×</button></div>}
            {filterHasPhone && <div className="filter-pill" style={{ background: "#1a1a2e", borderColor: "#4338ca", color: "#818cf8" }}>📞 Has Phone<button onClick={() => setFilterHasPhone(false)}>×</button></div>}
            {filterList && <div className="filter-pill" style={{ background: "var(--info-bg)", borderColor: "var(--info-border)", color: "var(--info)" }}>📋 {filterList}<button onClick={() => setFilterList("")}>×</button></div>}
            {(filterDateFrom || filterDateTo) && <div className="filter-pill" style={{ background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success)" }}>📅 {filterDateFrom || "…"} → {filterDateTo || "…"}<button onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); }}>×</button></div>}
            {filterDuplicates && <div className="filter-pill" style={{ background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger)" }}>🚨 Duplicates only<button onClick={() => setFilterDuplicates(false)}>×</button></div>}
            {activeFilterCount > 0 && <button className="btn btn-sm" style={{ borderRadius: 20, border: "1px solid var(--input-border)", background: "transparent", color: "var(--text-muted)" }} onClick={clearAll}>✕ Clear all</button>}
          </>
        )}
      </div>

      {/* Advanced filter panel */}
      {showFilters && groupByCompany && (
        <div className="filter-panel">
          <div className="filter-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            {/* Column 1: Company name */}
            <div>
              <div className="form-label" style={{ marginBottom: 10 }}>Company Name</div>
              <input
                type="text"
                className="form-input"
                placeholder="Filter by company name…"
                value={cvFilterCompany}
                onChange={(e) => setCvFilterCompany(e.target.value)}
              />
            </div>

            {/* Column 2: Industry */}
            <div>
              <div className="form-label" style={{ marginBottom: 10 }}>Industry</div>
              <div className="flex flex-col gap-6" style={{ maxHeight: 320, overflowY: "auto" }}>
                {allIndustries.map((ind) => {
                  const checked = cvFilterIndustries.includes(ind);
                  const count = prospects.filter((p) => p.industry === ind).length;
                  return (
                    <label key={ind} className="checkbox-row" onClick={() => setCvFilterIndustries((prev) => checked ? prev.filter((x) => x !== ind) : [...prev, ind])}>
                      <div className={`checkbox-box${checked ? " checked" : ""}`} style={checked ? { borderColor: "#4338ca", background: "#1e1b4b" } : {}}>
                        {checked && <span style={{ color: "#818cf8", fontSize: 14 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 14, color: checked ? "#818cf8" : "var(--text-sec)", flex: 1 }}>{ind}</span>
                      <span className="mono" style={{ fontSize: 14, color: "var(--text-dim)" }}>{count}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Column 3: Status (companies with prospects in these statuses) */}
            <div>
              <div className="form-label" style={{ marginBottom: 10 }}>Has Prospect with Status</div>
              <div className="flex flex-col gap-6" style={{ maxHeight: 320, overflowY: "auto" }}>
                {STATUSES.map((s) => {
                  const c = STATUS_COLORS[s];
                  const checked = cvFilterStatuses.includes(s);
                  return (
                    <label key={s} className="checkbox-row" onClick={() => setCvFilterStatuses((prev) => checked ? prev.filter((x) => x !== s) : [...prev, s])}>
                      <div className={`checkbox-box${checked ? " checked" : ""}`} style={{ borderColor: checked ? c.border : undefined, background: checked ? c.bg : undefined }}>
                        {checked && <span style={{ color: c.text, fontSize: 14 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 14, color: checked ? c.text : "var(--text-sec)", flex: 1 }}>{s}</span>
                      <span className="mono" style={{ fontSize: 14, color: "var(--text-dim)" }}>{prospects.filter((p) => p.status === s).length}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {showFilters && !groupByCompany && (
        <div className="filter-panel">
          <div className="filter-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            {/* Column 1: Status */}
            <div>
              <div className="form-label" style={{ marginBottom: 10 }}>Status</div>
              <div className="flex flex-col gap-6" style={{ maxHeight: 320, overflowY: "auto" }}>
                {STATUSES.map((s) => {
                  const c = STATUS_COLORS[s];
                  const checked = filterStatuses.includes(s);
                  return (
                    <label key={s} className="checkbox-row" onClick={() => setFilterStatuses((prev) => checked ? prev.filter((x) => x !== s) : [...prev, s])}>
                      <div className={`checkbox-box${checked ? " checked" : ""}`} style={{ borderColor: checked ? c.border : undefined, background: checked ? c.bg : undefined }}>
                        {checked && <span style={{ color: c.text, fontSize: 14 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 14, color: checked ? c.text : "var(--text-sec)", flex: 1 }}>{s}</span>
                      <span className="mono" style={{ fontSize: 14, color: "var(--text-dim)" }}>{prospects.filter((p) => p.status === s).length}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Column 2: Industry + Company */}
            <div>
              <div className="form-label" style={{ marginBottom: 10 }}>Industry</div>
              <div className="flex flex-col gap-6 mb-16">
                {allIndustries.map((ind) => {
                  const checked = filterIndustries.includes(ind);
                  const count = prospects.filter((p) => p.industry === ind).length;
                  return (
                    <label key={ind} className="checkbox-row" onClick={() => setFilterIndustries((prev) => checked ? prev.filter((x) => x !== ind) : [...prev, ind])}>
                      <div className={`checkbox-box${checked ? " checked" : ""}`} style={checked ? { borderColor: "#4338ca", background: "#1e1b4b" } : {}}>
                        {checked && <span style={{ color: "#818cf8", fontSize: 14 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 14, color: checked ? "#818cf8" : "var(--text-sec)", flex: 1 }}>{ind}</span>
                      <span className="mono" style={{ fontSize: 14, color: "var(--text-dim)" }}>{count}</span>
                    </label>
                  );
                })}
              </div>
              <div className="form-label" style={{ marginBottom: 10 }}>Company</div>
              <input
                type="text"
                className="form-input"
                placeholder="Filter by company name…"
                value={filterCompany}
                onChange={(e) => setFilterCompany(e.target.value)}
              />
            </div>

            {/* Column 3: Engagement */}
            <div>
              <div className="form-label" style={{ marginBottom: 10 }}>Touchpoint Count</div>
              <div className="flex flex-col gap-6 mb-16">
                {[
                  { key: "All", label: "All" },
                  { key: "0", label: "Untouched (0)" },
                  { key: "1-3", label: "Low (1–3)" },
                  { key: "4-6", label: "Medium (4–6)" },
                  { key: "7+", label: "High (7+)" },
                ].map((opt) => {
                  const active = filterTouchpoints === opt.key;
                  let count;
                  if (opt.key === "All") count = prospects.length;
                  else if (opt.key === "0") count = prospects.filter((p) => p.touchpoints.length === 0).length;
                  else if (opt.key === "1-3") count = prospects.filter((p) => p.touchpoints.length >= 1 && p.touchpoints.length <= 3).length;
                  else if (opt.key === "4-6") count = prospects.filter((p) => p.touchpoints.length >= 4 && p.touchpoints.length <= 6).length;
                  else count = prospects.filter((p) => p.touchpoints.length >= 7).length;
                  return (
                    <label key={opt.key} className="checkbox-row" onClick={() => setFilterTouchpoints(opt.key)} style={{ padding: "5px 8px", borderRadius: 6, background: active ? "var(--primary-bg)" : "transparent", border: `1px solid ${active ? "var(--primary)" : "transparent"}` }}>
                      <span style={{ fontSize: 14, color: active ? "var(--primary-light)" : "var(--text-sec)", flex: 1 }}>{opt.label}</span>
                      <span className="mono" style={{ fontSize: 14, color: active ? "var(--primary-light)" : "var(--text-dim)" }}>{count}</span>
                    </label>
                  );
                })}
              </div>
              <div className="form-label" style={{ marginBottom: 10 }}>Contact Info</div>
              <div className="flex flex-col gap-8">
                <label className="checkbox-row" onClick={() => setFilterHasEmail((f) => !f)}>
                  <div className={`checkbox-box${filterHasEmail ? " checked" : ""}`} style={filterHasEmail ? { borderColor: "#4338ca", background: "#1e1b4b" } : {}}>
                    {filterHasEmail && <span style={{ color: "#818cf8", fontSize: 14 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 14, color: filterHasEmail ? "#818cf8" : "var(--text-sec)", flex: 1 }}>✉️ Has Email</span>
                  <span className="mono" style={{ fontSize: 14, color: "var(--text-dim)" }}>{prospects.filter((p) => p.email).length}</span>
                </label>
                <label className="checkbox-row" onClick={() => setFilterHasPhone((f) => !f)}>
                  <div className={`checkbox-box${filterHasPhone ? " checked" : ""}`} style={filterHasPhone ? { borderColor: "#4338ca", background: "#1e1b4b" } : {}}>
                    {filterHasPhone && <span style={{ color: "#818cf8", fontSize: 14 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 14, color: filterHasPhone ? "#818cf8" : "var(--text-sec)", flex: 1 }}>📞 Has Phone</span>
                  <span className="mono" style={{ fontSize: 14, color: "var(--text-dim)" }}>{prospects.filter((p) => p.phone).length}</span>
                </label>
              </div>
            </div>

            {/* Column 4: Date + List + Channel */}
            <div>
              <div className="form-label" style={{ marginBottom: 10 }}>Date Added</div>
              <div className="flex flex-col gap-10 mb-16">
                <div>
                  <div className="mono" style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 5 }}>From</div>
                  <input type="date" className="form-input" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
                </div>
                <div>
                  <div className="mono" style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 5 }}>To</div>
                  <input type="date" className="form-input" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
                </div>
                <div className="flex gap-6 flex-wrap">
                  {[{ label: "Last 7d", d: 7 }, { label: "Last 30d", d: 30 }, { label: "Last 90d", d: 90 }].map((q) => {
                    const from = new Date(Date.now() - q.d * 86400000).toISOString().slice(0, 10);
                    return <button key={q.label} className="dormant-chip" style={filterDateFrom === from && !filterDateTo ? { borderColor: "var(--primary)", color: "var(--primary-light)", background: "var(--primary-bg)" } : {}} onClick={() => { setFilterDateFrom(from); setFilterDateTo(""); }}>{q.label}</button>;
                  })}
                </div>
              </div>
              <div className="form-label" style={{ marginBottom: 10 }}>List Name</div>
              {allLists.length === 0 && <div style={{ fontSize: 14, color: "var(--text-dim)", fontStyle: "italic" }}>No lists yet</div>}
              <div className="flex flex-col gap-6 mb-16">
                {allLists.map((l) => (
                  <label key={l} className="checkbox-row" onClick={() => setFilterList(filterList === l ? "" : l)} style={{ padding: "6px 10px", borderRadius: 7, background: filterList === l ? "var(--info-bg)" : "transparent", border: `1px solid ${filterList === l ? "var(--info-border)" : "transparent"}` }}>
                    <div className={`checkbox-box${filterList === l ? " checked" : ""}`} style={filterList === l ? { borderColor: "var(--info-light)", background: "var(--info-border)" } : {}}>
                      {filterList === l && <span style={{ color: "var(--info)", fontSize: 14 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 14, color: filterList === l ? "var(--info-light)" : "var(--text-sec)", flex: 1 }}>📋 {l}</span>
                    <span className="mono" style={{ fontSize: 14, color: "var(--text-dim)" }}>{prospects.filter((p) => p.listName === l).length}</span>
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

      {/* Dormant chips — only in prospect view */}
      {groupByCompany ? (
        <div className="dormant-bar">
          <span className="mono ml-auto" style={{ fontSize: 14, color: "var(--text-dim)" }}>
            {companyGroups ? companyGroups.length : 0} compan{companyGroups && companyGroups.length === 1 ? "y" : "ies"} · {companyGroups ? companyGroups.reduce((a, [, ps]) => a + ps.length, 0) : 0} prospects
          </span>
        </div>
      ) : (
        <div className="dormant-bar">
          <span className="mono" style={{ fontSize: 14, color: "var(--text-muted)", marginRight: 4, whiteSpace: "nowrap" }}>UNTOUCHED:</span>
          {[{ key: "All", label: "Show All" }, { key: "7", label: "7d+" }, { key: "15", label: "15d+" }, { key: "30", label: "30d+" }].map((opt) => {
            const count = opt.key === "All" ? null : prospects.filter((p) => { const d = daysSinceLast(p); return d !== null && d >= Number(opt.key); }).length;
            return (
              <button key={opt.key} className={`dormant-chip${filterDormant === opt.key ? " active" : ""}`} onClick={() => { setFilterDormant(opt.key); setCustomDays(""); }}>
                {opt.label}
                {count !== null && <span className={`dormant-count${filterDormant === opt.key ? " active" : ""}`} style={{ background: filterDormant === opt.key ? "var(--warning-bg)" : "var(--border)", color: filterDormant === opt.key ? "var(--warning-alt)" : "var(--text-muted)" }}>{count}</span>}
              </button>
            );
          })}
          <div className="flex items-center" style={{ background: "var(--surface)", border: `1px solid ${filterDormant === "custom" ? "var(--warning-alt)" : "var(--input-border)"}`, borderRadius: 20, overflow: "hidden" }}>
            <span className="mono" style={{ fontSize: 14, color: "var(--text-muted)", paddingLeft: 12 }}>Custom:</span>
            <input type="number" min="1" max="365" value={customDays} placeholder="e.g. 45" onChange={(e) => { setCustomDays(e.target.value); setFilterDormant(e.target.value && Number(e.target.value) > 0 ? "custom" : "All"); }} style={{ width: 64, background: "transparent", border: "none", padding: "5px 6px", color: "var(--text)", fontSize: 14, outline: "none", fontFamily: "var(--mono)" }} />
            <span className="mono" style={{ fontSize: 14, color: "var(--text-muted)", paddingRight: 12 }}>days+</span>
          </div>
          {filterDormant !== "All" && <button className="dormant-chip" onClick={() => { setFilterDormant("All"); setCustomDays(""); }}>✕ Clear</button>}
          <span className="mono ml-auto" style={{ fontSize: 14, color: "var(--text-dim)" }}>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
        </div>
      )}

      {/* Table */}
      <div style={{ padding: "0 32px 32px" }}>
        {selectedIds.size > 0 && (
          <div className="select-bar">
            <span style={{ fontSize: 14, color: "var(--primary-light)", fontWeight: 600 }}>{selectedIds.size} selected</span>
            <button className="btn btn-success btn-sm" onClick={() => { dispatch({ type: "COMPLETE_ALL_FOR_PROSPECTS", payload: [...selectedIds] }); setSelectedIds(new Set()); }}>⚡ Complete All Sequence Steps</button>
            <button className="btn btn-sm" style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)", color: "var(--danger)" }} onClick={() => { if (window.confirm(`Delete ${selectedIds.size} prospect${selectedIds.size > 1 ? "s" : ""}? This cannot be undone.`)) { dispatch({ type: "DELETE_PROSPECTS", payload: [...selectedIds] }); setSelectedIds(new Set()); } }}>🗑 Delete Selected</button>
            <button style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 14, cursor: "pointer", fontFamily: "var(--font)" }} onClick={() => setSelectedIds(new Set())}>✕ Clear</button>
            <span className="mono ml-auto" style={{ fontSize: 14, color: "var(--text-dim)" }}>Marks all pending sequence tasks as done</span>
          </div>
        )}

        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 32, padding: "12px 8px" }}>
                <input type="checkbox" checked={selectedIds.size === sorted.length && sorted.length > 0} onChange={(e) => setSelectedIds(e.target.checked ? new Set(sorted.map((p) => p.id)) : new Set())} style={{ cursor: "pointer", accentColor: "var(--primary)" }} />
              </th>
              {tableHeaders.map(({ label, col }) => (
                <th key={label || "actions"}
                  onClick={col ? () => toggleSort(col) : undefined}
                  style={col ? { cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" } : {}}
                  title={col ? `Sort by ${label}` : undefined}
                >
                  {label}
                  {col && (
                    <span style={{ marginLeft: 5, opacity: sortBy === col ? 1 : 0.3, fontSize: 11 }}>
                      {sortBy === col ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* ── Grouped by Company view ── */}
            {groupByCompany && companyGroups ? (
              companyGroups.map(([company, companyProspects]) => {
                const isExpanded = expandedCompanies.has(company);
                const firstP = companyProspects[0];
                const research = companyProspects.find((p) => p.research)?.research || null;
                const isResearching = researchingCompany === company;
                const resError = researchErrors[company];
                return (
                  <CompanyGroup
                    key={company}
                    company={company}
                    industry={firstP.industry}
                    prospects={companyProspects}
                    isExpanded={isExpanded}
                    onToggle={() => toggleCompanyExpand(company)}
                    research={research}
                    isResearching={isResearching}
                    resError={resError}
                    onFetchResearch={() => fetchCompanyResearch(company, firstP.industry)}
                    onDeleteResearch={() => deleteCompanyResearch(company)}
                    onChangeIndustry={changeCompanyIndustry}
                    renderRow={renderRow}
                    colCount={colCount}
                  />
                );
              })
            ) : (
              /* ── Flat list view ── */
              sorted.map(renderRow)
            )}

            {sorted.length === 0 && (
              <tr>
                <td colSpan={colCount} style={{ paddingTop: 56, paddingBottom: 40, textAlign: "center" }}>
                  {prospects.length === 0 ? (
                    <div>
                      <div style={{ fontSize: 36, marginBottom: 12 }}>👥</div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>No prospects yet</div>
                      <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 16 }}>Add your first prospect or import a CSV to get started.</div>
                      {onAdd && <button className="btn btn-primary" onClick={onAdd}>+ Add Prospect</button>}
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 8 }}>No prospects match your filters.</div>
                      <button className="btn btn-ghost btn-sm" onClick={clearAll}>Clear filters</button>
                    </div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Task popover */}
      {taskPopover && createPortal(
        <div ref={taskPopoverRef} onClick={(e) => e.stopPropagation()} className="task-popover"
          style={{ top: taskPopover.top, left: taskPopover.left, maxHeight: `calc(100vh - ${taskPopover.top}px - 12px)`, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>⚡ Pending Tasks</span>
            <button onClick={() => setTaskPopover(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0, fontFamily: "var(--font)" }}>×</button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            {tasksToday.filter((t) => t.prospect.id === taskPopover.id).map((task) => {
              const stepIdx = task.seq.steps.findIndex((s) => s.id === task.step.id);
              return (
                <div key={`${task.enrollmentId}-${task.step.id}`} className="task-popover-item">
                  <span style={{ fontSize: 15, flexShrink: 0 }}>{CHANNEL_ICONS[task.step.channel] || "📌"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{task.step.channel}</div>
                    <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      Step {stepIdx + 1}/{task.seq.steps.length} · {task.seq.name}
                    </div>
                    {task.step.note && <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.step.note}</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: "8px 10px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
            <button className="btn btn-primary btn-sm" style={{ width: "100%", fontSize: 13 }} onClick={() => { const id = taskPopover.id; setTaskPopover(null); onLogTouchpoint(id); }}>+ Log to complete</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ── Company Group sub-component ── */
function CompanyGroup({ company, industry, prospects, isExpanded, onToggle, research, isResearching, resError, onFetchResearch, onDeleteResearch, renderRow, colCount, onChangeIndustry }) {
  const [showResearch, setShowResearch] = useState(false);

  const statusSummary = useMemo(() => {
    const map = {};
    prospects.forEach((p) => { map[p.status] = (map[p.status] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [prospects]);

  /* Research panel content (reused in both layouts) */
  const researchContent = (
    <div style={{
      background: "linear-gradient(135deg, rgba(99,102,241,0.05), rgba(59,130,246,0.03))",
      border: "1px solid var(--border)",
      borderLeft: "3px solid var(--primary)",
      padding: "14px 20px",
      margin: 0,
      borderRadius: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>🔍 Research — {company}</span>
        <div style={{ display: "flex", gap: 4 }}>
          {research && <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: "var(--danger)" }} onClick={(e) => { e.stopPropagation(); onDeleteResearch(); setShowResearch(false); }}>🗑 Delete</button>}
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={(e) => { e.stopPropagation(); setShowResearch(false); }}>✕ Close</button>
        </div>
      </div>
      {isResearching && (
        <div style={{ textAlign: "center", padding: "12px" }}>
          <div style={{ fontSize: 14, color: "var(--text-muted)" }}>⏳ Researching {company}… This takes 10–20 seconds</div>
        </div>
      )}
      {resError && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "var(--danger)", fontSize: 13 }}>Research failed: {resError}</span>
          <button className="btn btn-ghost btn-sm" onClick={onFetchResearch}>Try Again</button>
        </div>
      )}
      {research && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span className="mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>Researched at {research.fetchedAt}</span>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={(e) => { e.stopPropagation(); onFetchResearch(); }}>↻ Refresh</button>
          </div>
          <RenderBrief text={research.brief} />
        </div>
      )}
      {!research && !isResearching && !resError && (
        <div style={{ textAlign: "center", padding: "8px" }}>
          <button className="btn btn-primary btn-sm" onClick={onFetchResearch}>🔍 Research {company}</button>
        </div>
      )}
    </div>
  );

  /* Side-by-side layout: research + prospects visible together */
  const showSplitView = showResearch && isExpanded;

  return (
    <>
      {/* Company header row */}
      <tr
        onClick={onToggle}
        style={{
          cursor: "pointer",
          background: "var(--surface)",
          borderLeft: "3px solid var(--primary)",
        }}
      >
        <td colSpan={colCount} style={{ padding: "10px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600, width: 16, textAlign: "center" }}>
              {isExpanded ? "▼" : "▶"}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>🏢 {company}</span>
                <select
                  value={industry || ""}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => { e.stopPropagation(); onChangeIndustry(company, e.target.value); }}
                  style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--border)", border: "1px solid var(--border)", borderRadius: 10, padding: "1px 8px", cursor: "pointer", outline: "none", fontFamily: "var(--font)" }}
                >
                  {INDUSTRIES.map((ind) => <option key={ind} value={ind}>{ind}</option>)}
                </select>
                <span className="mono" style={{ fontSize: 13, color: "var(--primary-light)", fontWeight: 600 }}>{prospects.length} prospect{prospects.length !== 1 ? "s" : ""}</span>
                {statusSummary.map(([status, count]) => (
                  <Badge key={status} status={status} />
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className={`btn btn-sm${showResearch ? " btn-primary" : " btn-ghost"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  const willShow = !showResearch;
                  setShowResearch(willShow);
                  if (willShow && !isExpanded) onToggle(); // auto-expand to show prospects alongside research
                  if (willShow && !research && !isResearching) onFetchResearch();
                }}
                style={{ fontSize: 12 }}
              >
                🔍 {research ? "Research" : "Get Research"}
              </button>
            </div>
          </div>
        </td>
      </tr>

      {/* Split view: research left + prospects right */}
      {showSplitView && (
        <tr>
          <td colSpan={colCount} style={{ padding: 0 }}>
            <div style={{ display: "flex", gap: 0, minHeight: 120 }}>
              {/* Research panel — left side */}
              <div style={{ flex: "0 0 38%", maxWidth: "38%", overflowY: "auto", maxHeight: 420, padding: "8px 8px 8px 0" }}>
                {researchContent}
              </div>
              {/* Prospect list — right side */}
              <div style={{ flex: 1, overflowY: "auto", maxHeight: 420, borderLeft: "1px solid var(--border)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--surface)", position: "sticky", top: 0, zIndex: 1 }}>
                      <th style={{ padding: "6px 8px", fontSize: 11, color: "var(--text-muted)", textAlign: "left", fontWeight: 600 }}>Prospect</th>
                      <th style={{ padding: "6px 8px", fontSize: 11, color: "var(--text-muted)", textAlign: "left", fontWeight: 600 }}>Status</th>
                      <th style={{ padding: "6px 8px", fontSize: 11, color: "var(--text-muted)", textAlign: "left", fontWeight: 600 }}>Last Activity</th>
                      <th style={{ padding: "6px 8px", fontSize: 11, color: "var(--text-muted)", textAlign: "left", fontWeight: 600 }}>Contact</th>
                      <th style={{ padding: "6px 8px", fontSize: 11, color: "var(--text-muted)", textAlign: "left", fontWeight: 600 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {prospects.map(renderRow)}
                  </tbody>
                </table>
              </div>
            </div>
          </td>
        </tr>
      )}

      {/* Research-only panel (when prospects are collapsed) */}
      {showResearch && !isExpanded && (
        <tr>
          <td colSpan={colCount} style={{ padding: "8px 0" }}>
            {researchContent}
          </td>
        </tr>
      )}

      {/* Prospect rows only (no research open) */}
      {isExpanded && !showResearch && prospects.map(renderRow)}
    </>
  );
}
