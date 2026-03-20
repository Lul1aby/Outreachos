import { useMemo, useState, useCallback, useEffect } from "react";
import { useStore } from "../store";
import { supabase } from "../supabase";
import { STATUSES, INDUSTRIES, CHANNELS, STATUS_COLORS, CHANNEL_ICONS } from "../constants";
import { fmtDate, daysSinceLast, isTerminalStatus } from "../utils";
import { MiniBar } from "./ui";

function escapeCSV(val) {
  if (val === null || val === undefined) return "";
  const s = String(val);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

function AdminSourceSelector({ selectedUsers, setSelectedUsers, adminAllData, ownEmail, ownProspectCount }) {
  const [open, setOpen] = useState(false);

  const users = [
    { id: "own", email: ownEmail || "My Account", count: ownProspectCount },
    ...(adminAllData || [])
      .filter((u) => u.userEmail?.toLowerCase() !== ownEmail?.toLowerCase())
      .map((u) => ({ id: u.userId, email: u.userEmail, count: (u.prospects || []).length })),
  ];

  const allIds = users.map((u) => u.id);
  const allSelected = allIds.every((id) => selectedUsers.has(id));

  function toggle(id) {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      if (next.size === 0) next.add("own");
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelectedUsers(new Set(["own"]));
    else setSelectedUsers(new Set(allIds));
  }

  const label = allSelected ? "All Users"
    : selectedUsers.size === 1 && selectedUsers.has("own") ? (ownEmail || "My Account")
    : `${selectedUsers.size} users selected`;

  return (
    <div style={{ position: "relative" }}>
      <span style={{ fontSize: 13, color: "var(--text-muted)", fontFamily: "var(--mono)", marginRight: 8 }}>Viewing:</span>
      <button onClick={() => setOpen((o) => !o)} style={{
        fontSize: 13, padding: "6px 12px", borderRadius: 6, cursor: "pointer",
        border: "1px solid var(--border)", background: "var(--surface-raised)",
        color: "var(--text)", display: "inline-flex", alignItems: "center", gap: 6, maxWidth: 260,
      }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ opacity: 0.5, flexShrink: 0 }}>▾</span>
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 100,
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
            minWidth: 260, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", padding: "6px 0",
          }}>
            <label style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 14px",
              cursor: "pointer", fontSize: 13, fontWeight: 600,
              borderBottom: "1px solid var(--border)", background: allSelected ? "var(--primary-bg)" : "transparent",
            }}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ accentColor: "var(--primary)", width: 14, height: 14, flexShrink: 0 }} />
              Select All
            </label>
            {users.map((u) => (
              <label key={u.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 14px",
                cursor: "pointer", fontSize: 13, background: selectedUsers.has(u.id) ? "var(--primary-bg)" : "transparent",
              }}>
                <input type="checkbox" checked={selectedUsers.has(u.id)} onChange={() => toggle(u.id)}
                  style={{ accentColor: "var(--primary)", width: 14, height: 14, flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {u.email}{u.id === "own" ? " (you)" : ""}
                </span>
                {u.count !== null && <span style={{ fontSize: 12, color: "var(--text-dim)", flexShrink: 0 }}>({u.count})</span>}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Drilldown Modal: shows prospect list behind any clicked metric ── */
function DrilldownModal({ title, prospects, onClose, onSelectProspect }) {
  const [search, setSearch] = useState("");
  const filtered = search.trim()
    ? prospects.filter((p) => `${p.name} ${p.company} ${p.title || ""}`.toLowerCase().includes(search.toLowerCase()))
    : prospects;
  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200 }} onClick={onClose} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 201,
        background: "var(--card-bg, var(--surface-raised))", border: "1px solid var(--border)", borderRadius: 14,
        width: "min(680px, 92vw)", maxHeight: "80vh", display: "flex", flexDirection: "column",
        boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
      }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{title}</div>
            <div className="mono" style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>{prospects.length} prospect{prospects.length !== 1 ? "s" : ""}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "4px 8px", fontFamily: "var(--font)" }}>×</button>
        </div>
        {prospects.length > 5 && (
          <div style={{ padding: "8px 20px 0", flexShrink: 0 }}>
            <input type="text" placeholder="Search name, company…" value={search} onChange={(e) => setSearch(e.target.value)}
              className="form-input" style={{ marginBottom: 0, fontSize: 13, padding: "6px 10px", borderRadius: 6, width: "100%" }} />
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 12px 12px" }}>
          {filtered.length === 0 && <div style={{ textAlign: "center", padding: 20, color: "var(--text-dim)", fontSize: 14 }}>No matches</div>}
          {filtered.map((p) => (
            <div key={p.id || p.name + p.company} onClick={() => { if (onSelectProspect) { onSelectProspect(p.id); } }}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8,
                cursor: onSelectProspect ? "pointer" : "default", marginBottom: 2,
                background: "var(--surface)", border: "1px solid transparent", transition: "border-color .1s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--primary)"}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = "transparent"}
            >
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg, var(--primary), var(--accent))", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                {(p.name || "?")[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }} className="truncate">{p.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }} className="truncate">{p.company}{p.title ? ` · ${p.title}` : ""}</div>
              </div>
              <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 10, background: STATUS_COLORS[p.status]?.bg, color: STATUS_COLORS[p.status]?.text, border: `1px solid ${STATUS_COLORS[p.status]?.border}`, whiteSpace: "nowrap", flexShrink: 0 }}>{p.status}</span>
              <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)", flexShrink: 0 }}>{p.touchpoints.length} tp</span>
              {onSelectProspect && <span style={{ fontSize: 14, color: "var(--text-dim)", flexShrink: 0 }}>→</span>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default function Analytics({ onSelectProspect }) {
  const { state, allLists, user } = useStore();
  const [selectedList, setSelectedList] = useState("__all__");
  const [reviewPeriod, setReviewPeriod] = useState("daily");
  const [drilldown, setDrilldown] = useState(null); // { title, prospects }
  const [analyticsView, setAnalyticsView] = useState("prospect"); // "prospect" | "company"
  const [companySortBy, setCompanySortBy] = useState("prospects"); // sort key for company table
  const [companySortDir, setCompanySortDir] = useState("desc");
  const [companySearch, setCompanySearch] = useState("");

  /* ── Admin data source ── */
  const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = !!user?.email && (adminEmails.includes(user.email.toLowerCase()) || user?.app_metadata?.role === "admin");
  const [selectedUsers, setSelectedUsers] = useState(() => new Set(["own"]));
  const [adminAllData, setAdminAllData] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);

  useEffect(() => {
    if (!isAdmin || adminAllData) return;
    setAdminLoading(true);
    (async () => {
      try {
        const session = await supabase?.auth.getSession();
        const token = session?.data?.session?.access_token;
        const res = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        });
        const body = await res.json();
        if (res.ok) setAdminAllData(body.users || []);
      } catch { /* fail silently */ }
      finally { setAdminLoading(false); }
    })();
  }, [isAdmin]);

  const sourceProspects = useMemo(() => {
    if (!isAdmin) return state.prospects;
    const own = selectedUsers.has("own") ? state.prospects : [];
    const fromOthers = (adminAllData || []).filter((u) => selectedUsers.has(u.userId)).flatMap((u) => u.prospects || []);
    return [...own, ...fromOthers];
  }, [isAdmin, selectedUsers, adminAllData, state.prospects]);

  const sourceLists = useMemo(() => [...new Set(sourceProspects.map((p) => p.listName).filter(Boolean))].sort(), [sourceProspects]);

  const downloadReport = useCallback(() => {
    const src = selectedList === "__all__" ? sourceProspects : sourceProspects.filter((p) => p.listName === selectedList);
    const rows = [
      ["Name", "Company", "Title", "Industry", "Status", "List", "Email", "Phone", "LinkedIn", "Created", "Touchpoints", "Last Touch Date", "Days Since Last Touch", "Channels Used", "Notes"],
      ...src.map((p) => {
        const days = daysSinceLast(p);
        const lastTouch = p.touchpoints.length ? [...p.touchpoints].sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.date : "";
        const channels = [...new Set(p.touchpoints.map((t) => t.channel))].join("; ");
        return [p.name, p.company, p.title || "", p.industry || "", p.status, p.listName || "", p.email || "", p.phone || "", p.linkedin || "", fmtDate(p.createdAt), p.touchpoints.length, lastTouch ? fmtDate(lastTouch) : "", days !== null ? days : "", channels, p.notes || ""];
      }),
    ];
    const csv = rows.map((r) => r.map(escapeCSV).join(",")).join("\n");
    const label = selectedList === "__all__" ? "all-prospects" : selectedList.replace(/\s+/g, "-").toLowerCase();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `outreach-report-${label}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [sourceProspects, selectedList]);

  const prospects = useMemo(() => {
    if (selectedList === "__all__") return sourceProspects;
    return sourceProspects.filter((p) => p.listName === selectedList);
  }, [sourceProspects, selectedList]);

  const data = useMemo(() => {
    const total = prospects.length;
    const allTp = prospects.flatMap((p) => p.touchpoints);

    /* ── Status / channel counts ── */
    const statusCounts = {};
    STATUSES.forEach((s) => { statusCounts[s] = prospects.filter((p) => p.status === s).length; });
    const byChannel = {};
    CHANNELS.forEach((c) => { byChannel[c] = allTp.filter((t) => t.channel === c).length; });

    /* ── Funnel ── */
    const contacted = prospects.filter((p) => p.touchpoints.length > 0).length;
    const replied = prospects.filter((p) => ["Replied", "Meeting Booked", "Opportunity"].includes(p.status)).length;
    const meeting = prospects.filter((p) => ["Meeting Booked", "Opportunity"].includes(p.status)).length;
    const won = prospects.filter((p) => p.status === "Opportunity").length;
    const notInt = prospects.filter((p) => p.status === "Not Interested").length;
    const noResp = prospects.filter((p) => p.status === "No Response").length;
    const callBack = prospects.filter((p) => p.status === "Call Back").length;
    const nurture = prospects.filter((p) => p.status === "Nurture").length;
    const trials = prospects.filter((p) => p.status === "Trials").length;
    const wrongInvalid = prospects.filter((p) => p.status === "Wrong/Invalid").length;
    const closedNeg = notInt + noResp + wrongInvalid;

    const funnelSteps = [
      { label: "Total", val: total, color: "var(--primary)", pct: 100 },
      { label: "Touched", val: contacted, color: "var(--info)", pct: total ? Math.round((contacted / total) * 100) : 0 },
      { label: "Replied", val: replied, color: "var(--success)", pct: total ? Math.round((replied / total) * 100) : 0 },
      { label: "Meeting", val: meeting, color: "var(--accent)", pct: total ? Math.round((meeting / total) * 100) : 0 },
      { label: "Opportunity", val: won, color: "var(--success-bright)", pct: total ? Math.round((won / total) * 100) : 0 },
    ];

    const dropOffs = [
      { from: "Touched → Replied", lost: contacted - replied, rate: contacted ? Math.round((1 - replied / contacted) * 100) : 0 },
      { from: "Replied → Meeting", lost: replied - meeting, rate: replied ? Math.round((1 - meeting / replied) * 100) : 0 },
      { from: "Meeting → Opportunity", lost: meeting - won, rate: meeting ? Math.round((1 - won / meeting) * 100) : 0 },
    ];

    /* ── FIX: Rejection by channel — use TOUCHPOINT outcome, not prospect status ── */
    const rejByChannel = CHANNELS.map((c) => {
      const channelTps = allTp.filter((t) => t.channel === c);
      const totalForChannel = channelTps.length;
      const negTps = channelTps.filter((t) => t.status === "Not Interested").length;
      return { name: c, total: totalForChannel, neg: negTps, rate: totalForChannel ? Math.round((negTps / totalForChannel) * 100) : 0 };
    }).filter((r) => r.total > 0).sort((a, b) => b.rate - a.rate);

    /* ── FIX: Rejection by industry — use TOUCHPOINT outcome ── */
    const rejByIndustry = INDUSTRIES.map((i) => {
      const indProspects = prospects.filter((p) => p.industry === i);
      const indTps = indProspects.flatMap((p) => p.touchpoints);
      const negTps = indTps.filter((t) => t.status === "Not Interested").length;
      return { name: i, total: indTps.length, neg: negTps, rate: indTps.length ? Math.round((negTps / indTps.length) * 100) : 0 };
    }).filter((r) => r.neg > 0).sort((a, b) => b.rate - a.rate);

    /* ── Follow Up by industry/channel ── */
    const followUpByIndustry = INDUSTRIES.map((i) => {
      const ind = prospects.filter((p) => p.industry === i);
      const cb = ind.filter((p) => p.status === "Call Back").length;
      const nu = ind.filter((p) => p.status === "Nurture").length;
      return { name: i, total: ind.length, callBack: cb, nurture: nu, followUp: cb + nu, rate: ind.length ? Math.round(((cb + nu) / ind.length) * 100) : 0 };
    }).filter((r) => r.followUp > 0).sort((a, b) => b.followUp - a.followUp);

    const followUpByChannel = CHANNELS.map((c) => {
      const touched = prospects.filter((p) => p.touchpoints.some((t) => t.channel === c));
      const cb = touched.filter((p) => p.status === "Call Back").length;
      const nu = touched.filter((p) => p.status === "Nurture").length;
      return { name: c, total: touched.length, callBack: cb, nurture: nu, followUp: cb + nu, rate: touched.length ? Math.round(((cb + nu) / touched.length) * 100) : 0 };
    }).filter((r) => r.total > 0).sort((a, b) => b.followUp - a.followUp);

    /* ── Channel reply rate ── */
    const channelReply = CHANNELS.map((c) => {
      const touched = prospects.filter((p) => p.touchpoints.some((t) => t.channel === c));
      const r = touched.filter((p) => ["Replied", "Meeting Booked", "Opportunity"].includes(p.status)).length;
      return { name: c, touched: touched.length, replied: r, rate: touched.length ? Math.round((r / touched.length) * 100) : 0, totalTp: byChannel[c] };
    }).filter((c) => c.touched > 0).sort((a, b) => b.rate - a.rate);

    /* ── Outcome breakdown per channel (NEW: shows exactly what happened on each channel) ── */
    const channelOutcomes = CHANNELS.map((c) => {
      const tps = allTp.filter((t) => t.channel === c);
      if (!tps.length) return null;
      const outcomes = {};
      tps.forEach((t) => { const s = t.status || "No Outcome"; outcomes[s] = (outcomes[s] || 0) + 1; });
      const sorted = Object.entries(outcomes).sort((a, b) => b[1] - a[1]);
      return { channel: c, total: tps.length, outcomes: sorted };
    }).filter(Boolean);

    /* ── Touchpoints → reply ── */
    const withReply = prospects.filter((p) => ["Replied", "Meeting Booked", "Opportunity"].includes(p.status));
    const avgTpToReply = withReply.length ? Math.round((withReply.reduce((a, p) => a + p.touchpoints.length, 0) / withReply.length) * 10) / 10 : 0;
    const avgTpAll = total ? Math.round((prospects.reduce((a, p) => a + p.touchpoints.length, 0) / total) * 10) / 10 : 0;

    /* ── Velocity ── */
    const velocities = withReply.map((p) => {
      const dates = p.touchpoints.map((t) => new Date(t.date)).sort((a, b) => a - b);
      return dates.length ? Math.round((dates[dates.length - 1] - new Date(p.createdAt)) / 86400000) : null;
    }).filter((v) => v !== null);
    const avgVelocity = velocities.length ? Math.round(velocities.reduce((a, b) => a + b, 0) / velocities.length) : 0;

    /* ── Activity last 30 days ── */
    const actMap = {};
    allTp.forEach((t) => { actMap[t.date] = (actMap[t.date] || 0) + 1; });
    const addMap = {};
    prospects.forEach((p) => { addMap[p.createdAt] = (addMap[p.createdAt] || 0) + 1; });
    const last30 = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (29 - i));
      const key = d.toISOString().slice(0, 10);
      return { key, label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), count: actMap[key] || 0, added: addMap[key] || 0 };
    });
    const maxAct = Math.max(...last30.map((d) => d.count), 1);
    const maxAdded = Math.max(...last30.map((d) => d.added), 1);

    /* ── Weekly activity trend (NEW) ── */
    const weeklyActivity = [];
    for (let w = 3; w >= 0; w--) {
      const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - (w * 7 + 6));
      const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() - (w * 7));
      let tpCount = 0, addCount = 0;
      for (let d = 0; d < 7; d++) {
        const day = new Date(weekStart); day.setDate(day.getDate() + d);
        const key = day.toISOString().slice(0, 10);
        tpCount += actMap[key] || 0;
        addCount += addMap[key] || 0;
      }
      const label = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      weeklyActivity.push({ label, tpCount, addCount });
    }

    /* ── Industry performance ── */
    const IND_COLORS = ["var(--primary)", "var(--accent)", "var(--info)", "var(--success)", "var(--warning)", "var(--warning-alt)", "var(--danger)"];
    const industryStats = INDUSTRIES.filter((i) => prospects.filter((p) => p.industry === i).length > 0).map((i, idx) => {
      const ind = prospects.filter((p) => p.industry === i);
      const r = ind.filter((p) => ["Replied", "Meeting Booked", "Opportunity"].includes(p.status)).length;
      const m = ind.filter((p) => ["Meeting Booked", "Opportunity"].includes(p.status)).length;
      const ni = ind.filter((p) => p.status === "Not Interested").length;
      return { name: i, total: ind.length, replied: r, meetings: m, notInterested: ni, replyRate: ind.length ? Math.round((r / ind.length) * 100) : 0, color: IND_COLORS[idx % IND_COLORS.length] };
    }).sort((a, b) => b.replyRate - a.replyRate);

    /* ── Touchpoint distribution buckets ── */
    const buckets = [
      { label: "0-5 touches", filter: (p) => p.touchpoints.length <= 5, color: "var(--info)" },
      { label: "5-10 touches", filter: (p) => p.touchpoints.length > 5 && p.touchpoints.length <= 10, color: "var(--accent)" },
      { label: "10-15 touches", filter: (p) => p.touchpoints.length > 10 && p.touchpoints.length <= 15, color: "var(--warning)" },
      { label: "15+ touches", filter: (p) => p.touchpoints.length > 15, color: "var(--warning-alt)" },
    ].map((b) => {
      const group = prospects.filter(b.filter);
      const r = group.filter((p) => ["Replied", "Meeting Booked", "Opportunity"].includes(p.status)).length;
      return { ...b, count: group.length, replyRate: group.length ? Math.round((r / group.length) * 100) : 0 };
    });

    /* ── Stale prospects (NEW) ── */
    const stale7 = prospects.filter((p) => { const d = daysSinceLast(p); return d !== null && d >= 7 && !["Not Interested", "Wrong/Invalid", "Meeting Booked", "Opportunity"].includes(p.status); }).length;
    const stale14 = prospects.filter((p) => { const d = daysSinceLast(p); return d !== null && d >= 14 && !["Not Interested", "Wrong/Invalid", "Meeting Booked", "Opportunity"].includes(p.status); }).length;
    const stale30 = prospects.filter((p) => { const d = daysSinceLast(p); return d !== null && d >= 30 && !["Not Interested", "Wrong/Invalid", "Meeting Booked", "Opportunity"].includes(p.status); }).length;
    const untouched = prospects.filter((p) => p.touchpoints.length === 0).length;

    /* ── Activity Review — daily / weekly / monthly / quarterly / yearly ── */
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    function periodStats(startDate, endDate, prevStart, prevEnd) {
      const sKey = startDate.toISOString().slice(0, 10);
      const eKey = endDate.toISOString().slice(0, 10);
      const psKey = prevStart.toISOString().slice(0, 10);
      const peKey = prevEnd.toISOString().slice(0, 10);
      const tps = allTp.filter((t) => t.date >= sKey && t.date <= eKey);
      const prevTps = allTp.filter((t) => t.date >= psKey && t.date <= peKey);
      const added = prospects.filter((p) => p.createdAt >= sKey && p.createdAt <= eKey).length;
      const prevAdded = prospects.filter((p) => p.createdAt >= psKey && p.createdAt <= peKey).length;
      const byC = {};
      CHANNELS.forEach((c) => { byC[c] = tps.filter((t) => t.channel === c).length; });
      const prevByC = {};
      CHANNELS.forEach((c) => { prevByC[c] = prevTps.filter((t) => t.channel === c).length; });
      const replies = tps.filter((t) => ["Replied", "Meeting Booked", "Opportunity"].includes(t.status)).length;
      const prevReplies = prevTps.filter((t) => ["Replied", "Meeting Booked", "Opportunity"].includes(t.status)).length;
      const meetings = tps.filter((t) => t.status === "Meeting Booked").length;
      const prevMeetings = prevTps.filter((t) => t.status === "Meeting Booked").length;
      const opps = tps.filter((t) => t.status === "Opportunity").length;
      const prevOpps = prevTps.filter((t) => t.status === "Opportunity").length;
      const notInt = tps.filter((t) => t.status === "Not Interested").length;
      const prevNotInt = prevTps.filter((t) => t.status === "Not Interested").length;
      // Daily breakdown within this period
      const dayMap = {};
      tps.forEach((t) => { dayMap[t.date] = (dayMap[t.date] || 0) + 1; });
      const days = [];
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const k = d.toISOString().slice(0, 10);
        days.push({ key: k, label: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }), count: dayMap[k] || 0 });
      }
      return {
        total: tps.length, prevTotal: prevTps.length,
        added, prevAdded, byChannel: byC, prevByChannel: prevByC,
        replies, prevReplies, meetings, prevMeetings, opps, prevOpps,
        notInt, prevNotInt, days,
        start: sKey, end: eKey,
      };
    }
    function makeDate(y, m, d) { return new Date(y, m, d); }
    // Daily: today vs yesterday
    const dToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dYesterday = new Date(dToday); dYesterday.setDate(dYesterday.getDate() - 1);
    const dailyReview = periodStats(dToday, dToday, dYesterday, dYesterday);
    // Weekly: this week (Mon-Sun) vs last week
    const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const weekStart = new Date(dToday); weekStart.setDate(weekStart.getDate() - dayOfWeek);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
    const prevWeekStart = new Date(weekStart); prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekEnd = new Date(weekStart); prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
    const weeklyReview = periodStats(weekStart, dToday < weekEnd ? dToday : weekEnd, prevWeekStart, prevWeekEnd);
    // Monthly: this month vs last month
    const monthStart = makeDate(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = makeDate(now.getFullYear(), now.getMonth() + 1, 0);
    const prevMonthStart = makeDate(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = makeDate(now.getFullYear(), now.getMonth(), 0);
    const monthlyReview = periodStats(monthStart, dToday < monthEnd ? dToday : monthEnd, prevMonthStart, prevMonthEnd);
    // Quarterly: this quarter vs last quarter
    const qtr = Math.floor(now.getMonth() / 3);
    const qtrStart = makeDate(now.getFullYear(), qtr * 3, 1);
    const qtrEnd = makeDate(now.getFullYear(), qtr * 3 + 3, 0);
    const prevQtrStart = makeDate(qtr === 0 ? now.getFullYear() - 1 : now.getFullYear(), qtr === 0 ? 9 : (qtr - 1) * 3, 1);
    const prevQtrEnd = makeDate(now.getFullYear(), qtr * 3, 0);
    const quarterlyReview = periodStats(qtrStart, dToday < qtrEnd ? dToday : qtrEnd, prevQtrStart, prevQtrEnd);
    // Yearly: this year vs last year
    const yearStart = makeDate(now.getFullYear(), 0, 1);
    const yearEnd = makeDate(now.getFullYear(), 11, 31);
    const prevYearStart = makeDate(now.getFullYear() - 1, 0, 1);
    const prevYearEnd = makeDate(now.getFullYear() - 1, 11, 31);
    const yearlyReview = periodStats(yearStart, dToday < yearEnd ? dToday : yearEnd, prevYearStart, prevYearEnd);

    const activityReview = { daily: dailyReview, weekly: weeklyReview, monthly: monthlyReview, quarterly: quarterlyReview, yearly: yearlyReview };

    /* ── Top performers (prospects closest to conversion) (NEW) ── */
    const hotProspects = prospects
      .filter((p) => ["Replied", "Call Back", "Connected +ve", "Trials"].includes(p.status))
      .sort((a, b) => b.touchpoints.length - a.touchpoints.length)
      .slice(0, 8);

    /* ── List performance (NEW) ── */
    const listStats = sourceLists.map((l) => {
      const lp = prospects.filter((p) => p.listName === l);
      const r = lp.filter((p) => ["Replied", "Meeting Booked", "Opportunity"].includes(p.status)).length;
      const m = lp.filter((p) => ["Meeting Booked", "Opportunity"].includes(p.status)).length;
      const ni = lp.filter((p) => p.status === "Not Interested").length;
      return { name: l, total: lp.length, replied: r, meetings: m, notInterested: ni, replyRate: lp.length ? Math.round((r / lp.length) * 100) : 0 };
    }).sort((a, b) => b.replyRate - a.replyRate);

    /* ── Company-level analytics ── */
    const companyMap = new Map();
    prospects.forEach((p) => {
      const key = p.company || "Unknown";
      if (!companyMap.has(key)) companyMap.set(key, []);
      companyMap.get(key).push(p);
    });

    const companyStats = [...companyMap.entries()].map(([company, members]) => {
      const totalP = members.length;
      const tps = members.flatMap((p) => p.touchpoints);
      const totalTp = tps.length;
      const avgTp = totalP ? Math.round((totalTp / totalP) * 10) / 10 : 0;
      const contacted = members.filter((p) => p.touchpoints.length > 0).length;
      const replied = members.filter((p) => ["Replied", "Meeting Booked", "Opportunity"].includes(p.status)).length;
      const meetings = members.filter((p) => ["Meeting Booked", "Opportunity"].includes(p.status)).length;
      const opportunity = members.filter((p) => p.status === "Opportunity").length;
      const notInterested = members.filter((p) => p.status === "Not Interested").length;
      const noResponse = members.filter((p) => p.status === "No Response").length;
      const wrongInvalid = members.filter((p) => p.status === "Wrong/Invalid").length;
      const callBackC = members.filter((p) => p.status === "Call Back").length;
      const nurtureC = members.filter((p) => p.status === "Nurture").length;
      const trialsC = members.filter((p) => p.status === "Trials").length;
      const dnpBusy = members.filter((p) => p.status === "DNP/Busy").length;
      const connectedPos = members.filter((p) => p.status === "Connected +ve").length;
      const untouchedC = members.filter((p) => p.touchpoints.length === 0).length;
      const starredC = members.filter((p) => p.starred).length;
      const replyRate = totalP ? Math.round((replied / totalP) * 100) : 0;
      const deadCount = notInterested + noResponse + wrongInvalid;
      const deadRate = totalP ? Math.round((deadCount / totalP) * 100) : 0;
      const industry = members[0]?.industry || "—";

      // Channels used + channel touchpoint counts
      const channelCounts = {};
      tps.forEach((t) => { channelCounts[t.channel] = (channelCounts[t.channel] || 0) + 1; });
      const channelsUsed = Object.keys(channelCounts);

      // Touchpoint outcome breakdown (from touchpoints, not prospect status)
      const tpOutcomes = {};
      tps.forEach((t) => { const s = t.status || "No Outcome"; tpOutcomes[s] = (tpOutcomes[s] || 0) + 1; });

      // Status breakdown
      const statusBreakdown = {};
      members.forEach((p) => { statusBreakdown[p.status] = (statusBreakdown[p.status] || 0) + 1; });

      // Staleness (exclude terminal statuses)
      const stalenesses = members.filter((p) => !isTerminalStatus(p)).map((p) => daysSinceLast(p)).filter((d) => d !== null);
      const maxStale = stalenesses.length ? Math.max(...stalenesses) : null;
      const avgStale = stalenesses.length ? Math.round(stalenesses.reduce((a, b) => a + b, 0) / stalenesses.length) : null;

      // Last activity date
      const allDates = tps.map((t) => t.date).sort();
      const lastActivityDate = allDates.length ? allDates[allDates.length - 1] : null;

      // Velocity: avg days from creation to first reply for replied members
      const repliedMembers = members.filter((p) => ["Replied", "Meeting Booked", "Opportunity"].includes(p.status));
      const velocities = repliedMembers.map((p) => {
        const dates = p.touchpoints.map((t) => new Date(t.date)).sort((a, b) => a - b);
        return dates.length ? Math.round((dates[dates.length - 1] - new Date(p.createdAt)) / 86400000) : null;
      }).filter((v) => v !== null);
      const velocity = velocities.length ? Math.round(velocities.reduce((a, b) => a + b, 0) / velocities.length) : null;

      return {
        company, totalP, totalTp, avgTp, contacted, replied, meetings, opportunity,
        notInterested, noResponse, wrongInvalid, deadCount, deadRate,
        callBack: callBackC, nurture: nurtureC, trials: trialsC, dnpBusy, connectedPos,
        untouched: untouchedC, starred: starredC, replyRate, industry,
        channelsUsed, channelCounts, tpOutcomes, statusBreakdown,
        maxStale, avgStale, lastActivityDate, velocity, members,
      };
    });

    // Aggregates
    const totalCompanies = companyStats.length;
    const avgProspectsPerCompany = totalCompanies ? Math.round((total / totalCompanies) * 10) / 10 : 0;
    const companiesWithMeetings = companyStats.filter((c) => c.meetings > 0).length;
    const companiesWithReplies = companyStats.filter((c) => c.replied > 0).length;
    const companiesWithOpps = companyStats.filter((c) => c.opportunity > 0).length;
    const companiesUntouched = companyStats.filter((c) => c.untouched === c.totalP).length;
    const companiesStale7 = companyStats.filter((c) => c.avgStale !== null && c.avgStale >= 7 && c.meetings === 0 && c.opportunity === 0).length;
    const companiesWithNI = companyStats.filter((c) => c.notInterested > 0).length;
    const companiesWithCB = companyStats.filter((c) => c.callBack > 0).length;
    const companiesWithNurture = companyStats.filter((c) => c.nurture > 0).length;
    const totalCompanyProspects = companyStats.reduce((a, c) => a + c.totalP, 0);
    const totalCompanyTp = companyStats.reduce((a, c) => a + c.totalTp, 0);
    const totalCompanyReplied = companyStats.reduce((a, c) => a + c.replied, 0);
    const totalCompanyMeetings = companyStats.reduce((a, c) => a + c.meetings, 0);
    const totalCompanyNI = companyStats.reduce((a, c) => a + c.notInterested, 0);
    const totalCompanyCB = companyStats.reduce((a, c) => a + c.callBack, 0);
    const totalCompanyNurture = companyStats.reduce((a, c) => a + c.nurture, 0);
    const totalCompanyDead = companyStats.reduce((a, c) => a + c.deadCount, 0);
    const overallCompanyReplyRate = totalCompanyProspects ? Math.round((totalCompanyReplied / totalCompanyProspects) * 100) : 0;
    const overallCompanyDeadRate = totalCompanyProspects ? Math.round((totalCompanyDead / totalCompanyProspects) * 100) : 0;

    // Avg velocity across all companies
    const allVelocities = companyStats.map((c) => c.velocity).filter((v) => v !== null);
    const avgCompanyVelocity = allVelocities.length ? Math.round(allVelocities.reduce((a, b) => a + b, 0) / allVelocities.length) : 0;

    // Top companies by reply rate (min 2 prospects)
    const topByReplyRate = [...companyStats].filter((c) => c.totalP >= 2).sort((a, b) => b.replyRate - a.replyRate).slice(0, 5);
    // Top by engagement (most touchpoints)
    const topByEngagement = [...companyStats].sort((a, b) => b.totalTp - a.totalTp).slice(0, 5);
    // Most prospects
    const topBySize = [...companyStats].sort((a, b) => b.totalP - a.totalP).slice(0, 5);
    // Worst dead rate (min 2 prospects)
    const worstByDeadRate = [...companyStats].filter((c) => c.totalP >= 2 && c.deadCount > 0).sort((a, b) => b.deadRate - a.deadRate).slice(0, 5);
    // Companies in follow-up pipeline (CB + Nurture + Trials)
    const companiesInFollowUp = companyStats.filter((c) => c.callBack > 0 || c.nurture > 0 || c.trials > 0).sort((a, b) => (b.callBack + b.nurture + b.trials) - (a.callBack + a.nurture + a.trials));

    // Company industry distribution (enhanced)
    const companyByIndustry = {};
    companyStats.forEach((c) => {
      const ind = c.industry || "—";
      if (!companyByIndustry[ind]) companyByIndustry[ind] = { count: 0, prospects: 0, replied: 0, meetings: 0, notInterested: 0, callBack: 0, nurture: 0, dead: 0 };
      companyByIndustry[ind].count++;
      companyByIndustry[ind].prospects += c.totalP;
      companyByIndustry[ind].replied += c.replied;
      companyByIndustry[ind].meetings += c.meetings;
      companyByIndustry[ind].notInterested += c.notInterested;
      companyByIndustry[ind].callBack += c.callBack;
      companyByIndustry[ind].nurture += c.nurture;
      companyByIndustry[ind].dead += c.deadCount;
    });

    // Company funnel (enhanced with outcomes)
    const companyFunnel = [
      { label: "Total Companies", val: totalCompanies, color: "var(--primary)", pct: 100 },
      { label: "With Activity", val: companyStats.filter((c) => c.totalTp > 0).length, color: "var(--info)", pct: totalCompanies ? Math.round((companyStats.filter((c) => c.totalTp > 0).length / totalCompanies) * 100) : 0 },
      { label: "With Replies", val: companiesWithReplies, color: "var(--success)", pct: totalCompanies ? Math.round((companiesWithReplies / totalCompanies) * 100) : 0 },
      { label: "With Meetings", val: companiesWithMeetings, color: "var(--accent)", pct: totalCompanies ? Math.round((companiesWithMeetings / totalCompanies) * 100) : 0 },
      { label: "With Opportunity", val: companiesWithOpps, color: "var(--success-bright)", pct: totalCompanies ? Math.round((companiesWithOpps / totalCompanies) * 100) : 0 },
    ];

    // Company drop-offs (mirroring prospect funnel)
    const companyWithActivity = companyStats.filter((c) => c.totalTp > 0).length;
    const companyDropOffs = [
      { from: "Active → Replied", lost: companyWithActivity - companiesWithReplies, rate: companyWithActivity ? Math.round((1 - companiesWithReplies / companyWithActivity) * 100) : 0 },
      { from: "Replied → Meeting", lost: companiesWithReplies - companiesWithMeetings, rate: companiesWithReplies ? Math.round((1 - companiesWithMeetings / companiesWithReplies) * 100) : 0 },
      { from: "Meeting → Opportunity", lost: companiesWithMeetings - companiesWithOpps, rate: companiesWithMeetings ? Math.round((1 - companiesWithOpps / companiesWithMeetings) * 100) : 0 },
    ];

    // Channel effectiveness at company level
    const companyChannelStats = CHANNELS.map((ch) => {
      const companiesUsingChannel = companyStats.filter((c) => c.channelsUsed.includes(ch));
      const totalTpForChannel = companiesUsingChannel.reduce((a, c) => a + (c.channelCounts[ch] || 0), 0);
      const companiesReplied = companiesUsingChannel.filter((c) => c.replied > 0).length;
      const rate = companiesUsingChannel.length ? Math.round((companiesReplied / companiesUsingChannel.length) * 100) : 0;
      return { channel: ch, companies: companiesUsingChannel.length, totalTp: totalTpForChannel, companiesReplied, rate };
    }).filter((c) => c.companies > 0).sort((a, b) => b.rate - a.rate);

    // Company size distribution
    const companySizeBuckets = [
      { label: "1 prospect", filter: (c) => c.totalP === 1, color: "var(--info)" },
      { label: "2–3 prospects", filter: (c) => c.totalP >= 2 && c.totalP <= 3, color: "var(--accent)" },
      { label: "4–6 prospects", filter: (c) => c.totalP >= 4 && c.totalP <= 6, color: "var(--warning)" },
      { label: "7+ prospects", filter: (c) => c.totalP >= 7, color: "var(--warning-alt)" },
    ].map((b) => {
      const group = companyStats.filter(b.filter);
      const repliedInGroup = group.reduce((a, c) => a + c.replied, 0);
      const prospectsInGroup = group.reduce((a, c) => a + c.totalP, 0);
      return { ...b, count: group.length, prospects: prospectsInGroup, replyRate: prospectsInGroup ? Math.round((repliedInGroup / prospectsInGroup) * 100) : 0 };
    });

    // Outcome distribution across all company prospects
    const companyOutcomeDist = {};
    companyStats.forEach((c) => {
      Object.entries(c.statusBreakdown).forEach(([status, count]) => {
        companyOutcomeDist[status] = (companyOutcomeDist[status] || 0) + count;
      });
    });

    const companyAnalytics = {
      companyStats, totalCompanies, avgProspectsPerCompany,
      companiesWithMeetings, companiesWithReplies, companiesWithOpps, companiesUntouched, companiesStale7,
      companiesWithNI, companiesWithCB, companiesWithNurture,
      totalCompanyProspects, totalCompanyTp, totalCompanyReplied, totalCompanyMeetings,
      totalCompanyNI, totalCompanyCB, totalCompanyNurture, totalCompanyDead,
      overallCompanyReplyRate, overallCompanyDeadRate, avgCompanyVelocity,
      topByReplyRate, topByEngagement, topBySize, worstByDeadRate, companiesInFollowUp,
      companyByIndustry, companyFunnel, companyDropOffs, companyChannelStats,
      companySizeBuckets, companyOutcomeDist,
    };

    return {
      total, allTp, statusCounts, funnelSteps, dropOffs, noResp, notInt, closedNeg, wrongInvalid,
      callBack, nurture, trials, followUpByIndustry, followUpByChannel,
      rejByIndustry, rejByChannel, channelReply, channelOutcomes, byChannel,
      avgTpToReply, avgTpAll, avgVelocity, meeting, won, contacted, replied,
      last30, maxAct, maxAdded, weeklyActivity, industryStats, buckets,
      stale7, stale14, stale30, untouched, hotProspects, listStats, activityReview,
      companyAnalytics,
    };
  }, [prospects, sourceLists]);

  const drill = useCallback((title, filterFn) => {
    setDrilldown({ title, prospects: prospects.filter(filterFn) });
  }, [prospects]);

  const drillList = useCallback((title, list) => {
    setDrilldown({ title, prospects: list });
  }, []);

  if (adminLoading && !adminAllData) {
    return (
      <div style={{ padding: "24px 32px", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400, gap: 10, color: "var(--text-muted)" }}>
        Loading analytics data…
      </div>
    );
  }

  if (sourceProspects.length === 0) {
    return (
      <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, gap: 12, textAlign: "center" }}>
        {isAdmin && (
          <div style={{ marginBottom: 8 }}>
            <AdminSourceSelector selectedUsers={selectedUsers} setSelectedUsers={(s) => { setSelectedUsers(s); setSelectedList("__all__"); }} adminAllData={adminAllData} ownEmail={user?.email} ownProspectCount={state.prospects.length} />
          </div>
        )}
        <div style={{ fontSize: 42 }}>📊</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>No data yet</div>
        <div style={{ fontSize: 14, color: "var(--text-muted)", maxWidth: 320 }}>
          {!(selectedUsers.size === 1 && selectedUsers.has("own")) ? "Selected users have no prospects yet." : "Add prospects or import a CSV to start seeing analytics."}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 32px" }} className="flex flex-col gap-20">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-12">
        <div>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 2 }}>Analytics Dashboard</div>
          <div className="mono" style={{ fontSize: 14, color: "var(--text-muted)" }}>{data.total} prospects · {data.companyAnalytics.totalCompanies} companies · {data.allTp.length} touchpoints</div>
        </div>
        <div className="flex items-center gap-8 flex-wrap">
          {isAdmin && (
            <AdminSourceSelector selectedUsers={selectedUsers} setSelectedUsers={(s) => { setSelectedUsers(s); setSelectedList("__all__"); }} adminAllData={adminAllData} ownEmail={user?.email} ownProspectCount={state.prospects.length} />
          )}
          {/* View toggle */}
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
            <button onClick={() => setAnalyticsView("prospect")} style={{
              padding: "6px 14px", fontSize: 13, fontWeight: analyticsView === "prospect" ? 700 : 400, cursor: "pointer",
              background: analyticsView === "prospect" ? "var(--primary)" : "var(--surface)", color: analyticsView === "prospect" ? "#fff" : "var(--text-muted)",
              border: "none", transition: "all .15s",
            }}>👤 Prospects</button>
            <button onClick={() => setAnalyticsView("company")} style={{
              padding: "6px 14px", fontSize: 13, fontWeight: analyticsView === "company" ? 700 : 400, cursor: "pointer",
              background: analyticsView === "company" ? "var(--primary)" : "var(--surface)", color: analyticsView === "company" ? "#fff" : "var(--text-muted)",
              border: "none", borderLeft: "1px solid var(--border)", transition: "all .15s",
            }}>🏢 Companies</button>
          </div>
          <span className="mono" style={{ fontSize: 14, color: "var(--text-muted)" }}>List:</span>
          <select className="form-select" style={{ marginBottom: 0, minWidth: 160, fontSize: 14 }} value={selectedList} onChange={(e) => setSelectedList(e.target.value)}>
            <option value="__all__">All Lists</option>
            {sourceLists.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <button className="btn btn-outline btn-sm" onClick={downloadReport} title="Download activity report as CSV" style={{ whiteSpace: "nowrap" }}>
            Download Report
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ═══  COMPANY VIEW  ═══════════════════════════════════════════ */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {analyticsView === "company" && (() => {
        const ca = data.companyAnalytics;

        // Sort + filter company table
        const toggleCompanySort = (col) => {
          if (companySortBy === col) setCompanySortDir((d) => d === "asc" ? "desc" : "asc");
          else { setCompanySortBy(col); setCompanySortDir("desc"); }
        };
        const q = companySearch.toLowerCase();
        const filteredCompanies = ca.companyStats
          .filter((c) => !q || c.company.toLowerCase().includes(q) || c.industry.toLowerCase().includes(q))
          .sort((a, b) => {
            let av, bv;
            if (companySortBy === "company") { av = a.company.toLowerCase(); bv = b.company.toLowerCase(); }
            else if (companySortBy === "prospects") { av = a.totalP; bv = b.totalP; }
            else if (companySortBy === "touchpoints") { av = a.totalTp; bv = b.totalTp; }
            else if (companySortBy === "replyRate") { av = a.replyRate; bv = b.replyRate; }
            else if (companySortBy === "meetings") { av = a.meetings; bv = b.meetings; }
            else if (companySortBy === "staleness") { av = a.avgStale ?? 9999; bv = b.avgStale ?? 9999; }
            else if (companySortBy === "industry") { av = a.industry.toLowerCase(); bv = b.industry.toLowerCase(); }
            else { av = a.totalP; bv = b.totalP; }
            if (av < bv) return companySortDir === "asc" ? -1 : 1;
            if (av > bv) return companySortDir === "asc" ? 1 : -1;
            return 0;
          });

        const SortHeader = ({ col, label, style }) => (
          <th onClick={() => toggleCompanySort(col)} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", ...style }}>
            {label}
            <span style={{ marginLeft: 4, opacity: companySortBy === col ? 1 : 0.3, fontSize: 11 }}>
              {companySortBy === col ? (companySortDir === "asc" ? "▲" : "▼") : "⇅"}
            </span>
          </th>
        );

        return (
          <>
            {/* Company KPI strip — expanded with all outcomes */}
            <div className="analytics-kpi-row">
              {[
                { label: "Companies", val: ca.totalCompanies, color: "var(--primary)" },
                { label: "Avg Prospects", val: ca.avgProspectsPerCompany, color: "var(--info)" },
                { label: "Reply Rate", val: `${ca.overallCompanyReplyRate}%`, color: "var(--success)" },
                { label: "With Meetings", val: ca.companiesWithMeetings, color: "var(--accent)" },
                { label: "With Opps", val: ca.companiesWithOpps, color: "var(--success-bright)" },
                { label: "Not Interested", val: ca.totalCompanyNI, color: "var(--danger)" },
                { label: "Call Back", val: ca.totalCompanyCB, color: "var(--warning-alt)" },
                { label: "Nurture", val: ca.totalCompanyNurture, color: "var(--accent-light)" },
                { label: "Dead Rate", val: `${ca.overallCompanyDeadRate}%`, color: "var(--danger-bright)" },
                { label: "Avg Velocity", val: ca.avgCompanyVelocity ? `${ca.avgCompanyVelocity}d` : "—", color: "var(--warning)" },
              ].map((k) => (
                <div key={k.label} className="analytics-kpi">
                  <div className="analytics-kpi-val" style={{ color: k.color }}>{k.val}</div>
                  <div className="analytics-kpi-label">{k.label}</div>
                </div>
              ))}
            </div>

            {/* Health Alerts */}
            {(ca.companiesUntouched > 0 || ca.companiesStale7 > 0 || ca.companiesWithNI > 0) && (
              <div className="flex gap-12 flex-wrap">
                {ca.companiesUntouched > 0 && (
                  <div style={{ flex: 1, minWidth: 200, padding: "12px 16px", borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "var(--danger)" }}>{ca.companiesUntouched}</div>
                    <div style={{ fontSize: 13, color: "var(--danger)", opacity: 0.9 }}>companies with zero touchpoints</div>
                  </div>
                )}
                {ca.companiesStale7 > 0 && (
                  <div style={{ flex: 1, minWidth: 200, padding: "12px 16px", borderRadius: 10, background: "var(--warning-bg)", border: "1px solid var(--warning-alt)33" }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "var(--warning-alt)" }}>{ca.companiesStale7}</div>
                    <div style={{ fontSize: 13, color: "var(--warning-alt)", opacity: 0.9 }}>companies stale 7+ days</div>
                  </div>
                )}
                {ca.companiesWithNI > 0 && (
                  <div style={{ flex: 1, minWidth: 200, padding: "12px 16px", borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "var(--danger)" }}>{ca.companiesWithNI}</div>
                    <div style={{ fontSize: 13, color: "var(--danger)", opacity: 0.9 }}>companies with Not Interested</div>
                  </div>
                )}
              </div>
            )}

            {/* Company Funnel + Drop-off Analysis (mirrors prospect view) */}
            <div className="analytics-grid-2">
              <div className="card">
                <div className="card-title">Company Conversion Funnel</div>
                <div className="flex flex-col gap-10">
                  {ca.companyFunnel.map((f) => (
                    <div key={f.label} className="funnel-row">
                      <div className="funnel-label">{f.label}</div>
                      <div className="funnel-bar">
                        <div className="funnel-bar-fill" style={{ width: `${f.pct}%`, background: f.color }} />
                        <div className="funnel-bar-text">{f.val}</div>
                      </div>
                      <div className="funnel-pct" style={{ color: f.color }}>{f.pct}%</div>
                    </div>
                  ))}
                  <div className="flex gap-20 pt-12 border-t mt-8" style={{ flexWrap: "wrap" }}>
                    {[
                      { label: "Not Interested", val: ca.totalCompanyNI, color: "var(--danger)" },
                      { label: "Call Back", val: ca.totalCompanyCB, color: "var(--warning-alt)" },
                      { label: "Nurture", val: ca.totalCompanyNurture, color: "var(--accent-light)" },
                      { label: "Dead", val: ca.totalCompanyDead, color: "var(--danger-bright)" },
                    ].map((x) => (
                      <div key={x.label} className="flex flex-col gap-4">
                        <div style={{ fontSize: 15, fontWeight: 700, color: x.color }}>{x.val}</div>
                        <div className="mono" style={{ fontSize: 14, color: "var(--text-muted)" }}>{x.label}</div>
                      </div>
                    ))}
                    <div className="ml-auto flex flex-col gap-4">
                      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--danger-bright)" }}>{ca.overallCompanyDeadRate}%</div>
                      <div className="mono" style={{ fontSize: 14, color: "var(--text-muted)" }}>dead rate</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="card-title">Stage Drop-off</div>
                <div className="flex flex-col gap-16">
                  {ca.companyDropOffs.map((d) => (
                    <div key={d.from}>
                      <div className="flex justify-between mb-6">
                        <span style={{ fontSize: 14, color: "var(--text-sec)" }}>{d.from}</span>
                        <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: d.rate > 60 ? "var(--danger-bright)" : d.rate > 30 ? "var(--warning-alt)" : "var(--success)" }}>{d.rate}% drop</span>
                      </div>
                      <MiniBar pct={d.rate} color={d.rate > 60 ? "var(--danger-bright)" : d.rate > 30 ? "var(--warning-alt)" : "var(--success)"} height={6} />
                      <div className="mono" style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 4 }}>{d.lost} companies lost</div>
                    </div>
                  ))}
                  <div className="pt-12 border-t">
                    <div className="mono" style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 4 }}>Avg velocity (add → reply)</div>
                    <div style={{ fontSize: 23, fontWeight: 700, color: "var(--primary-light)" }}>{ca.avgCompanyVelocity ? `${ca.avgCompanyVelocity}d` : "—"}</div>
                    <div style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 2 }}>{ca.totalCompanyProspects} prospects across {ca.totalCompanies} companies</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Outcome Distribution + Company Size + Channel Effectiveness */}
            <div className="analytics-grid-3">
              <div className="card">
                <div className="card-title">Outcome Distribution</div>
                {Object.entries(ca.companyOutcomeDist).sort((a, b) => b[1] - a[1]).map(([status, cnt]) => {
                  const pct = ca.totalCompanyProspects ? (cnt / ca.totalCompanyProspects) * 100 : 0;
                  return (
                    <div key={status} className="mb-8">
                      <div className="flex justify-between mb-4"><span style={{ fontSize: 14, color: STATUS_COLORS[status]?.text || "var(--text-sec)" }}>{status}</span><span className="mono" style={{ fontSize: 14, color: "var(--text-muted)" }}>{cnt} · {Math.round(pct)}%</span></div>
                      <MiniBar pct={pct} color={STATUS_COLORS[status]?.text || "var(--text-dim)"} />
                    </div>
                  );
                })}
              </div>
              <div className="card">
                <div className="card-title">Company Size Distribution</div>
                <div className="touch-dist-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                  {ca.companySizeBuckets.map((b) => (
                    <div key={b.label} className="touch-dist-card">
                      <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 6 }}>{b.label}</div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: b.color, letterSpacing: "-0.03em" }}>{b.count}</div>
                      <div className="mono" style={{ fontSize: 14, color: "var(--text-dim)" }}>{b.count === 1 ? "company" : "companies"}</div>
                      <div style={{ height: 4, background: "var(--border)", borderRadius: 2, marginTop: 8 }}>
                        <div style={{ height: "100%", width: `${ca.totalCompanies ? (b.count / ca.totalCompanies) * 100 : 0}%`, background: b.color, borderRadius: 2 }} />
                      </div>
                      <div className="mono" style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>{b.prospects} prospects · {b.replyRate}% reply</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <div className="card-title">Channel Effectiveness</div>
                {ca.companyChannelStats.length === 0 ? <div style={{ fontSize: 14, color: "var(--text-dim)" }}>No channel data yet</div> :
                  ca.companyChannelStats.map((ch) => (
                    <div key={ch.channel} className="mb-12">
                      <div className="flex justify-between mb-4">
                        <span style={{ fontSize: 14 }}>{CHANNEL_ICONS[ch.channel]} {ch.channel}</span>
                        <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: ch.rate > 30 ? "var(--success)" : ch.rate > 15 ? "var(--warning)" : "var(--text-muted)" }}>{ch.rate}%</span>
                      </div>
                      <MiniBar pct={ch.rate} color={ch.rate > 30 ? "var(--success)" : ch.rate > 15 ? "var(--warning)" : "var(--text-dim)"} />
                      <div className="mono" style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>{ch.companiesReplied}/{ch.companies} companies replied · {ch.totalTp} touches</div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Follow Up Pipeline + Worst Performers */}
            <div className="analytics-grid-3">
              <div className="card">
                <div className="card-title">Follow Up Pipeline</div>
                <div className="flex flex-col gap-16" style={{ paddingTop: 4 }}>
                  {[
                    { label: "Call Back", val: ca.totalCompanyCB, cos: ca.companiesWithCB, color: "var(--warning-alt)", bg: "var(--warning-bg)", desc: "Awaiting callback" },
                    { label: "Nurture", val: ca.totalCompanyNurture, cos: ca.companiesWithNurture, color: "var(--accent-light)", bg: "var(--accent-bg)", desc: "Long-term nurture" },
                  ].map((item) => (
                    <div key={item.label} style={{ padding: "12px 16px", borderRadius: 8, background: item.bg, border: `1px solid ${item.color}33` }}>
                      <div className="flex justify-between items-center mb-4">
                        <span style={{ fontSize: 14, color: item.color, fontWeight: 600 }}>{item.label}</span>
                        <span style={{ fontSize: 23, fontWeight: 700, color: item.color }}>{item.val}</span>
                      </div>
                      <div className="mono" style={{ fontSize: 14, color: "var(--text-muted)" }}>{item.desc} · {item.cos} {item.cos === 1 ? "company" : "companies"}</div>
                      <div style={{ height: 3, background: "var(--border)", borderRadius: 2, marginTop: 8 }}>
                        <div style={{ height: "100%", width: `${ca.totalCompanyProspects ? (item.val / ca.totalCompanyProspects) * 100 : 0}%`, background: item.color, borderRadius: 2 }} />
                      </div>
                    </div>
                  ))}
                  {ca.companiesInFollowUp.length > 0 && (
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                      <div className="mono" style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>TOP FOLLOW-UP COMPANIES</div>
                      {ca.companiesInFollowUp.slice(0, 5).map((c) => (
                        <div key={c.company} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, marginBottom: 3, cursor: "pointer", background: "var(--surface)" }}
                          onClick={() => drillList(`Company: ${c.company}`, c.members)}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="truncate" style={{ fontSize: 13, fontWeight: 600 }}>{c.company}</div>
                          </div>
                          <span className="mono" style={{ fontSize: 12, color: "var(--warning-alt)" }}>{c.callBack} CB</span>
                          <span className="mono" style={{ fontSize: 12, color: "var(--accent-light)" }}>{c.nurture} N</span>
                          {c.trials > 0 && <span className="mono" style={{ fontSize: 12, color: "var(--info-bright)" }}>{c.trials} T</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="card">
                <div className="card-title">Top by Reply Rate</div>
                {ca.topByReplyRate.length === 0 ? <div style={{ fontSize: 14, color: "var(--text-dim)" }}>Need 2+ prospects per company</div> :
                  ca.topByReplyRate.map((c, i) => (
                    <div key={c.company} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, background: "var(--surface)", marginBottom: 4, cursor: "pointer" }}
                      onClick={() => drillList(`Company: ${c.company}`, c.members)}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)", width: 18, textAlign: "center" }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="truncate" style={{ fontSize: 14, fontWeight: 600 }}>{c.company}</div>
                        <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>{c.totalP} prospects · {c.industry}</div>
                      </div>
                      <span style={{ fontSize: 16, fontWeight: 700, color: c.replyRate > 30 ? "var(--success)" : c.replyRate > 15 ? "var(--warning)" : "var(--text-muted)" }}>{c.replyRate}%</span>
                    </div>
                  ))}
              </div>
              <div className="card">
                <div className="card-title">Worst by Dead Rate</div>
                {ca.worstByDeadRate.length === 0 ? <div style={{ fontSize: 14, color: "var(--text-dim)" }}>No dead prospects yet</div> :
                  ca.worstByDeadRate.map((c, i) => (
                    <div key={c.company} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, background: "var(--surface)", marginBottom: 4, cursor: "pointer" }}
                      onClick={() => drillList(`Company: ${c.company}`, c.members)}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)", width: 18, textAlign: "center" }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="truncate" style={{ fontSize: 14, fontWeight: 600 }}>{c.company}</div>
                        <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>{c.totalP} prospects · {c.deadCount} dead</div>
                      </div>
                      <span style={{ fontSize: 16, fontWeight: 700, color: c.deadRate > 50 ? "var(--danger)" : "var(--warning-alt)" }}>{c.deadRate}%</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Industry breakdown + Top by Engagement */}
            <div className="analytics-grid-2">
              <div className="card">
                <div className="card-title">Companies by Industry</div>
                <div style={{ overflowX: "auto" }}>
                  <div className="flex flex-col">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 50px 55px 50px 50px 40px 40px 40px", gap: 4, padding: "4px 0", borderBottom: "1px solid var(--border)", marginBottom: 6 }}>
                      {["Industry", "Cos", "Prsps", "Reply", "Mtgs", "NI", "CB", "Nurt"].map((h) => <div key={h} className="mono" style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em" }}>{h}</div>)}
                    </div>
                    {Object.entries(ca.companyByIndustry).sort((a, b) => b[1].count - a[1].count).map(([ind, d]) => (
                      <div key={ind} style={{ display: "grid", gridTemplateColumns: "1fr 50px 55px 50px 50px 40px 40px 40px", gap: 4, padding: "7px 0", borderBottom: "1px solid var(--surface)", alignItems: "center" }}>
                        <div style={{ fontSize: 13, color: "var(--text-sec)" }}>{ind}</div>
                        <div className="mono" style={{ fontSize: 13, color: "var(--primary-light)", fontWeight: 600 }}>{d.count}</div>
                        <div className="mono" style={{ fontSize: 13, color: "var(--text-muted)" }}>{d.prospects}</div>
                        <div className="mono" style={{ fontSize: 13, color: "var(--success)" }}>{d.replied}</div>
                        <div className="mono" style={{ fontSize: 13, color: "var(--accent)" }}>{d.meetings}</div>
                        <div className="mono" style={{ fontSize: 13, color: d.notInterested > 0 ? "var(--danger)" : "var(--text-dim)" }}>{d.notInterested}</div>
                        <div className="mono" style={{ fontSize: 13, color: d.callBack > 0 ? "var(--warning-alt)" : "var(--text-dim)" }}>{d.callBack}</div>
                        <div className="mono" style={{ fontSize: 13, color: d.nurture > 0 ? "var(--accent-light)" : "var(--text-dim)" }}>{d.nurture}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="card-title">Top by Engagement</div>
                {ca.topByEngagement.map((c, i) => (
                  <div key={c.company} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, background: "var(--surface)", marginBottom: 4, cursor: "pointer" }}
                    onClick={() => drillList(`Company: ${c.company}`, c.members)}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)", width: 18, textAlign: "center" }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="truncate" style={{ fontSize: 14, fontWeight: 600 }}>{c.company}</div>
                      <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>{c.totalP} prospects · {c.avgTp} avg tp · {c.replyRate}% reply</div>
                    </div>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "var(--primary-light)" }}>{c.totalTp} tp</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Full Company Table */}
            <div className="card">
              <div className="flex items-center justify-between flex-wrap gap-12 mb-16">
                <div className="card-title" style={{ marginBottom: 0 }}>All Companies ({filteredCompanies.length})</div>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search company, industry…"
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                  style={{ marginBottom: 0, fontSize: 13, maxWidth: 240, padding: "5px 10px", borderRadius: 6 }}
                />
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <SortHeader col="company" label="Company" />
                      <SortHeader col="industry" label="Industry" />
                      <SortHeader col="prospects" label="Prospects" />
                      <SortHeader col="touchpoints" label="Touches" />
                      <SortHeader col="replyRate" label="Reply %" />
                      <SortHeader col="meetings" label="Mtgs" />
                      <th style={{ whiteSpace: "nowrap" }}>NI</th>
                      <th style={{ whiteSpace: "nowrap" }}>CB</th>
                      <th style={{ whiteSpace: "nowrap" }}>Dead%</th>
                      <SortHeader col="staleness" label="Stale" />
                      <th>Pipeline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCompanies.map((c) => (
                      <tr key={c.company} style={{ cursor: "pointer" }} onClick={() => drillList(`Company: ${c.company}`, c.members)}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {c.starred > 0 && <span style={{ fontSize: 13 }}>{"\u2B50"}</span>}
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>{c.company}</div>
                              <div className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>{c.channelsUsed.map((ch) => CHANNEL_ICONS[ch]).join(" ")}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize: 13, color: "var(--text-muted)" }}>{c.industry}</td>
                        <td className="mono" style={{ fontSize: 14 }}>
                          {c.totalP}
                          {c.untouched > 0 && <span style={{ fontSize: 11, color: "var(--danger)", marginLeft: 4 }}>({c.untouched})</span>}
                        </td>
                        <td className="mono" style={{ fontSize: 14, color: "var(--text-sec)" }}>{c.totalTp}</td>
                        <td className="mono" style={{ fontSize: 14, fontWeight: 600, color: c.replyRate > 30 ? "var(--success)" : c.replyRate > 15 ? "var(--warning)" : "var(--text-muted)" }}>{c.replyRate}%</td>
                        <td className="mono" style={{ fontSize: 14, color: c.meetings > 0 ? "var(--accent)" : "var(--text-dim)" }}>{c.meetings}</td>
                        <td className="mono" style={{ fontSize: 14, color: c.notInterested > 0 ? "var(--danger)" : "var(--text-dim)" }}>{c.notInterested}</td>
                        <td className="mono" style={{ fontSize: 14, color: c.callBack > 0 ? "var(--warning-alt)" : "var(--text-dim)" }}>{c.callBack}</td>
                        <td className="mono" style={{ fontSize: 14, fontWeight: 600, color: c.deadRate > 50 ? "var(--danger)" : c.deadRate > 25 ? "var(--warning-alt)" : "var(--text-dim)" }}>{c.deadRate}%</td>
                        <td className="mono" style={{ fontSize: 14, color: c.avgStale !== null ? (c.avgStale >= 14 ? "var(--danger)" : c.avgStale >= 7 ? "var(--warning-alt)" : "var(--success)") : "var(--text-dim)" }}>
                          {c.avgStale !== null ? `${c.avgStale}d` : "—"}
                        </td>
                        <td style={{ minWidth: 120 }}>
                          <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "var(--border)" }}>
                            {Object.entries(c.statusBreakdown).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
                              const pct = (count / c.totalP) * 100;
                              return pct > 0 ? <div key={status} title={`${status}: ${count}`} style={{ width: `${pct}%`, background: STATUS_COLORS[status]?.text || "var(--text-dim)" }} /> : null;
                            })}
                          </div>
                          <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                            {Object.entries(c.statusBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([status, count]) => (
                              <span key={status} className="mono" style={{ fontSize: 10, color: STATUS_COLORS[status]?.text || "var(--text-dim)" }}>{count} {status.split(" ")[0]}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredCompanies.length === 0 && (
                      <tr><td colSpan={11} style={{ textAlign: "center", padding: 30, color: "var(--text-dim)" }}>No companies match your search</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ═══  PROSPECT VIEW (original)  ═══════════════════════════════ */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {analyticsView === "prospect" && <>

      {/* KPI strip */}
      <div className="analytics-kpi-row">
        {[
          { label: "Total", val: data.total, color: "var(--primary)", filter: () => true },
          { label: "Touched", val: data.contacted, color: "var(--info)", filter: (p) => p.touchpoints.length > 0 },
          { label: "Untouched", val: data.untouched, color: "var(--text-dim)", filter: (p) => p.touchpoints.length === 0 },
          { label: "Reply Rate", val: `${data.total ? Math.round((data.replied / data.total) * 100) : 0}%`, color: "var(--success)", filter: (p) => ["Replied", "Meeting Booked", "Opportunity"].includes(p.status) },
          { label: "Meetings", val: data.meeting, color: "var(--accent)", filter: (p) => ["Meeting Booked", "Opportunity"].includes(p.status) },
          { label: "Opportunity", val: data.won, color: "var(--success-bright)", filter: (p) => p.status === "Opportunity" },
          { label: "Call Back", val: data.callBack, color: "var(--warning-alt)", filter: (p) => p.status === "Call Back" },
          { label: "Nurture", val: data.nurture, color: "var(--accent-light)", filter: (p) => p.status === "Nurture" },
          { label: "Not Interested", val: data.notInt, color: "var(--danger)", filter: (p) => p.status === "Not Interested" },
          { label: "Avg Velocity", val: data.avgVelocity ? `${data.avgVelocity}d` : "—", color: "var(--warning)", filter: (p) => ["Replied", "Meeting Booked", "Opportunity"].includes(p.status) },
        ].map((k) => (
          <div key={k.label} className="analytics-kpi" style={{ cursor: "pointer" }} onClick={() => drill(k.label, k.filter)}>
            <div className="analytics-kpi-val" style={{ color: k.color }}>{k.val}</div>
            <div className="analytics-kpi-label">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Health alerts (NEW) */}
      {(data.stale7 > 0 || data.untouched > 0) && (
        <div className="flex gap-12 flex-wrap">
          {data.untouched > 0 && (
            <div style={{ flex: 1, minWidth: 200, padding: "12px 16px", borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)", cursor: "pointer" }}
              onClick={() => drill("Untouched Prospects", (p) => p.touchpoints.length === 0)}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--danger)" }}>{data.untouched}</div>
              <div style={{ fontSize: 13, color: "var(--danger)", opacity: 0.9 }}>prospects never contacted</div>
            </div>
          )}
          {data.stale7 > 0 && (
            <div style={{ flex: 1, minWidth: 200, padding: "12px 16px", borderRadius: 10, background: "var(--warning-bg)", border: "1px solid var(--warning-alt)33", cursor: "pointer" }}
              onClick={() => drill("Stale 7+ Days", (p) => { const d = daysSinceLast(p); return d !== null && d >= 7 && !["Not Interested", "Wrong/Invalid", "Meeting Booked", "Opportunity"].includes(p.status); })}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--warning-alt)" }}>{data.stale7}</div>
              <div style={{ fontSize: 13, color: "var(--warning-alt)", opacity: 0.9 }}>stale 7+ days (active pipeline)</div>
            </div>
          )}
          {data.stale14 > 0 && (
            <div style={{ flex: 1, minWidth: 200, padding: "12px 16px", borderRadius: 10, background: "var(--warning-bg)", border: "1px solid var(--warning-alt)33", cursor: "pointer" }}
              onClick={() => drill("Stale 14+ Days", (p) => { const d = daysSinceLast(p); return d !== null && d >= 14 && !["Not Interested", "Wrong/Invalid", "Meeting Booked", "Opportunity"].includes(p.status); })}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#f97316" }}>{data.stale14}</div>
              <div style={{ fontSize: 13, color: "#f97316", opacity: 0.9 }}>stale 14+ days</div>
            </div>
          )}
          {data.stale30 > 0 && (
            <div style={{ flex: 1, minWidth: 200, padding: "12px 16px", borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)", cursor: "pointer" }}
              onClick={() => drill("Stale 30+ Days", (p) => { const d = daysSinceLast(p); return d !== null && d >= 30 && !["Not Interested", "Wrong/Invalid", "Meeting Booked", "Opportunity"].includes(p.status); })}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--danger)" }}>{data.stale30}</div>
              <div style={{ fontSize: 13, color: "var(--danger)", opacity: 0.9 }}>stale 30+ days — needs attention</div>
            </div>
          )}
        </div>
      )}

      {/* ── Activity Review ── */}
      {(() => {
        const periods = [
          { key: "daily", label: "Daily", desc: "Today" },
          { key: "weekly", label: "Weekly", desc: "This Week" },
          { key: "monthly", label: "Monthly", desc: "This Month" },
          { key: "quarterly", label: "Quarterly", desc: "This Quarter" },
          { key: "yearly", label: "Yearly", desc: "This Year" },
        ];
        const rv = data.activityReview[reviewPeriod];
        const delta = (cur, prev) => {
          if (prev === 0 && cur === 0) return null;
          if (prev === 0) return cur > 0 ? { pct: "+100%", positive: true } : null;
          const d = Math.round(((cur - prev) / prev) * 100);
          return { pct: `${d >= 0 ? "+" : ""}${d}%`, positive: d >= 0 };
        };
        const kpis = [
          { label: "Touchpoints", val: rv.total, prev: rv.prevTotal },
          { label: "Prospects Added", val: rv.added, prev: rv.prevAdded },
          { label: "Positive Replies", val: rv.replies, prev: rv.prevReplies },
          { label: "Meetings Booked", val: rv.meetings, prev: rv.prevMeetings },
          { label: "Opportunities", val: rv.opps, prev: rv.prevOpps },
          { label: "Not Interested", val: rv.notInt, prev: rv.prevNotInt },
        ];
        const maxDay = Math.max(...rv.days.map((d) => d.count), 1);
        const channelEntries = CHANNELS.map((c) => ({ name: c, val: rv.byChannel[c] || 0, prev: rv.prevByChannel[c] || 0 })).filter((c) => c.val > 0 || c.prev > 0);
        return (
          <div className="card">
            <div className="flex items-center justify-between flex-wrap gap-12 mb-16">
              <div className="card-title" style={{ marginBottom: 0 }}>Activity Review</div>
              <div className="flex gap-4">
                {periods.map((p) => (
                  <button key={p.key} onClick={() => setReviewPeriod(p.key)} style={{
                    padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: reviewPeriod === p.key ? 700 : 400, cursor: "pointer",
                    background: reviewPeriod === p.key ? "var(--primary)" : "var(--surface)", color: reviewPeriod === p.key ? "#fff" : "var(--text-muted)",
                    border: reviewPeriod === p.key ? "1px solid var(--primary)" : "1px solid var(--border)", transition: "all .15s",
                  }}>{p.label}</button>
                ))}
              </div>
            </div>
            <div className="mono" style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16 }}>
              {periods.find((p) => p.key === reviewPeriod)?.desc} ({rv.start}{rv.start !== rv.end ? ` → ${rv.end}` : ""}) vs previous period
            </div>

            {/* KPI cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
              {kpis.map((k) => {
                const d = delta(k.val, k.prev);
                const isNeg = k.label === "Not Interested";
                return (
                  <div key={k.label} style={{ padding: "14px 16px", borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 26, fontWeight: 700, color: k.val > 0 ? (isNeg ? "var(--danger)" : "var(--text)") : "var(--text-dim)", letterSpacing: "-0.02em" }}>{k.val}</div>
                    <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{k.label}</div>
                    {d && (
                      <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: isNeg ? (d.positive ? "var(--danger)" : "var(--success)") : (d.positive ? "var(--success)" : "var(--danger)") }}>
                        {d.pct} <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>vs prev</span>
                      </div>
                    )}
                    {!d && <div className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>— vs prev</div>}
                  </div>
                );
              })}
            </div>

            {/* Channel breakdown */}
            {channelEntries.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: "var(--text-sec)" }}>Channel Breakdown</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
                  {channelEntries.map((c) => {
                    const d = delta(c.val, c.prev);
                    return (
                      <div key={c.name} style={{ padding: "10px 14px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", textAlign: "center" }}>
                        <div style={{ fontSize: 18, marginBottom: 2 }}>{CHANNEL_ICONS[c.name]}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>{c.val}</div>
                        <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>{c.name}</div>
                        {d && <div className="mono" style={{ fontSize: 11, fontWeight: 600, color: d.positive ? "var(--success)" : "var(--danger)", marginTop: 2 }}>{d.pct}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Daily activity within period */}
            {rv.days.length > 1 && rv.days.length <= 90 && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: "var(--text-sec)" }}>Daily Activity</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: rv.days.length > 31 ? 1 : 2, height: 60 }}>
                  {rv.days.map((d) => (
                    <div key={d.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }} title={`${d.label}: ${d.count} touchpoints`}>
                      <div style={{ width: "85%", borderRadius: "2px 2px 0 0", height: Math.max((d.count / maxDay) * 55, d.count > 0 ? 3 : 0), background: "var(--primary)", opacity: 0.85 }} />
                    </div>
                  ))}
                </div>
                <div style={{ height: 1, background: "var(--border)", marginBottom: 4 }} />
                <div style={{ display: "flex", gap: rv.days.length > 31 ? 1 : 2 }}>
                  {rv.days.map((d, i) => {
                    const showEvery = rv.days.length <= 7 ? 1 : rv.days.length <= 14 ? 2 : rv.days.length <= 31 ? 5 : 10;
                    return (
                      <div key={d.key} style={{ flex: 1, textAlign: "center" }}>
                        {i % showEvery === 0 && <div className="mono" style={{ fontSize: 10, color: "var(--text-dim)" }}>{rv.days.length <= 7 ? d.label.split(",")[0] : d.label.split(" ").pop()}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* For yearly: show monthly summary instead of 365 bars */}
            {rv.days.length > 90 && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: "var(--text-sec)" }}>Monthly Summary</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))", gap: 8 }}>
                  {(() => {
                    const months = {};
                    rv.days.forEach((d) => {
                      const mKey = d.key.slice(0, 7);
                      months[mKey] = (months[mKey] || 0) + d.count;
                    });
                    const maxM = Math.max(...Object.values(months), 1);
                    return Object.entries(months).map(([mKey, count]) => {
                      const mDate = new Date(mKey + "-01");
                      return (
                        <div key={mKey} style={{ textAlign: "center", padding: "8px 6px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)" }}>
                          <div className="mono" style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>{mDate.toLocaleDateString("en-US", { month: "short" })}</div>
                          <div style={{ height: 30, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                            <div style={{ width: 20, borderRadius: "2px 2px 0 0", height: Math.max((count / maxM) * 28, count > 0 ? 3 : 0), background: "var(--primary)", opacity: 0.85 }} />
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginTop: 4 }}>{count}</div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Funnel + Drop-offs */}
      <div className="analytics-grid-2">
        <div className="card">
          <div className="card-title">Conversion Funnel</div>
          <div className="flex flex-col gap-10">
            {data.funnelSteps.map((f) => {
              const funnelFilters = {
                "Total": () => true,
                "Touched": (p) => p.touchpoints.length > 0,
                "Replied": (p) => ["Replied", "Meeting Booked", "Opportunity"].includes(p.status),
                "Meeting": (p) => ["Meeting Booked", "Opportunity"].includes(p.status),
                "Opportunity": (p) => p.status === "Opportunity",
              };
              return (
                <div key={f.label} className="funnel-row" style={{ cursor: "pointer" }} onClick={() => drill(`Funnel: ${f.label}`, funnelFilters[f.label] || (() => true))}>
                  <div className="funnel-label">{f.label}</div>
                  <div className="funnel-bar">
                    <div className="funnel-bar-fill" style={{ width: `${f.pct}%`, background: f.color }} />
                    <div className="funnel-bar-text">{f.val}</div>
                  </div>
                  <div className="funnel-pct" style={{ color: f.color }}>{f.pct}%</div>
                </div>
              );
            })}
            <div className="flex gap-20 pt-12 border-t mt-8" style={{ flexWrap: "wrap" }}>
              {[
                { label: "No Response", val: data.noResp, color: "var(--warning)" },
                { label: "Not Interested", val: data.notInt, color: "var(--danger)" },
                { label: "Wrong/Invalid", val: data.wrongInvalid, color: "var(--text-dim)" },
                { label: "Call Back", val: data.callBack, color: "var(--warning-alt)" },
                { label: "Nurture", val: data.nurture, color: "var(--accent-light)" },
              ].map((x) => (
                <div key={x.label} className="flex flex-col gap-4" style={{ cursor: "pointer" }} onClick={() => drill(x.label, (p) => p.status === x.label)}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: x.color }}>{x.val}</div>
                  <div className="mono" style={{ fontSize: 14, color: "var(--text-muted)" }}>{x.label}</div>
                </div>
              ))}
              <div className="ml-auto flex flex-col gap-4" style={{ cursor: "pointer" }}
                onClick={() => drill("Dead (NI + No Response + Wrong)", (p) => ["Not Interested", "No Response", "Wrong/Invalid"].includes(p.status))}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--danger-bright)" }}>{data.total ? Math.round((data.closedNeg / data.total) * 100) : 0}%</div>
                <div className="mono" style={{ fontSize: 14, color: "var(--text-muted)" }}>dead rate</div>
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Stage Drop-off</div>
          <div className="flex flex-col gap-16">
            {data.dropOffs.map((d) => (
              <div key={d.from}>
                <div className="flex justify-between mb-6">
                  <span style={{ fontSize: 14, color: "var(--text-sec)" }}>{d.from}</span>
                  <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: d.rate > 60 ? "var(--danger-bright)" : d.rate > 30 ? "var(--warning-alt)" : "var(--success)" }}>{d.rate}% drop</span>
                </div>
                <MiniBar pct={d.rate} color={d.rate > 60 ? "var(--danger-bright)" : d.rate > 30 ? "var(--warning-alt)" : "var(--success)"} height={6} />
                <div className="mono" style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 4 }}>{d.lost} prospects lost</div>
              </div>
            ))}
            <div className="pt-12 border-t">
              <div className="mono" style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 4 }}>Avg velocity (add → reply)</div>
              <div style={{ fontSize: 23, fontWeight: 700, color: "var(--primary-light)" }}>{data.avgVelocity ? `${data.avgVelocity}d` : "—"}</div>
              <div style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 2 }}>{data.avgTpAll} avg touchpoints per prospect</div>
            </div>
          </div>
        </div>
      </div>

      {/* Channel Outcome Breakdown (NEW — replaces misleading rejection analysis) */}
      <div className="analytics-grid-3">
        <div className="card">
          <div className="card-title">Not Interested — by Channel (touchpoint outcomes)</div>
          {data.rejByChannel.filter((r) => r.neg > 0).length === 0 ? <div style={{ fontSize: 14, color: "var(--text-dim)" }}>No "Not Interested" outcomes logged yet</div> :
            data.rejByChannel.filter((r) => r.neg > 0).map((r) => (
              <div key={r.name} className="mb-10">
                <div className="flex justify-between mb-4"><span style={{ fontSize: 14 }}>{CHANNEL_ICONS[r.name]} {r.name}</span><span className="mono" style={{ fontSize: 14, color: r.rate > 50 ? "var(--danger)" : "var(--text-muted)" }}>{r.neg}/{r.total} · {r.rate}%</span></div>
                <MiniBar pct={r.rate} color={r.rate > 50 ? "var(--danger-bright)" : r.rate > 25 ? "var(--warning-alt)" : "var(--warning)"} />
              </div>
            ))}
        </div>
        <div className="card">
          <div className="card-title">Not Interested — by Industry (touchpoint outcomes)</div>
          {data.rejByIndustry.length === 0 ? <div style={{ fontSize: 14, color: "var(--text-dim)" }}>No rejections yet</div> :
            data.rejByIndustry.map((r) => (
              <div key={r.name} className="mb-10">
                <div className="flex justify-between mb-4"><span style={{ fontSize: 14 }}>{r.name}</span><span className="mono" style={{ fontSize: 14, color: r.rate > 50 ? "var(--danger)" : "var(--text-muted)" }}>{r.neg}/{r.total} · {r.rate}%</span></div>
                <MiniBar pct={r.rate} color={r.rate > 50 ? "var(--danger-bright)" : r.rate > 25 ? "var(--warning-alt)" : "var(--warning)"} />
              </div>
            ))}
        </div>
        <div className="card">
          <div className="card-title">All Status Distribution</div>
          {STATUSES.map((s) => {
            const cnt = data.statusCounts[s];
            if (!cnt) return null;
            const pct = data.total ? (cnt / data.total) * 100 : 0;
            return (
              <div key={s} className="mb-8" style={{ cursor: "pointer" }} onClick={() => drill(`Status: ${s}`, (p) => p.status === s)}>
                <div className="flex justify-between mb-4"><span style={{ fontSize: 14, color: STATUS_COLORS[s].text }}>{s}</span><span className="mono" style={{ fontSize: 14, color: "var(--text-muted)" }}>{cnt} · {Math.round(pct)}%</span></div>
                <MiniBar pct={pct} color={STATUS_COLORS[s].text} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Channel Outcome Detail (NEW) */}
      {data.channelOutcomes.length > 0 && (
        <div className="card">
          <div className="card-title">Channel Outcome Breakdown — What Happened on Each Channel</div>
          <div className="channel-eff-grid">
            {data.channelOutcomes.map((co) => (
              <div key={co.channel} className="channel-eff-card" style={{ padding: "14px 16px" }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{CHANNEL_ICONS[co.channel]}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>{co.channel} <span className="mono" style={{ fontWeight: 400, color: "var(--text-dim)" }}>({co.total})</span></div>
                {co.outcomes.map(([outcome, count]) => {
                  const pct = Math.round((count / co.total) * 100);
                  const c = STATUS_COLORS[outcome];
                  return (
                    <div key={outcome} className="mb-6">
                      <div className="flex justify-between mb-2">
                        <span style={{ fontSize: 13, color: c?.text || "var(--text-sec)" }}>{outcome}</span>
                        <span className="mono" style={{ fontSize: 13, color: "var(--text-muted)" }}>{count} · {pct}%</span>
                      </div>
                      <MiniBar pct={pct} color={c?.text || "var(--text-dim)"} height={3} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Follow Up + Pipeline */}
      <div className="analytics-grid-3">
        <div className="card">
          <div className="card-title">Follow Up — by Industry</div>
          <div className="flex gap-16 mb-12">
            <div className="flex items-center gap-6" style={{ fontSize: 14, color: "var(--text-muted)" }}><div style={{ width: 8, height: 8, borderRadius: 2, background: "var(--warning-alt)" }} /> Call Back</div>
            <div className="flex items-center gap-6" style={{ fontSize: 14, color: "var(--text-muted)" }}><div style={{ width: 8, height: 8, borderRadius: 2, background: "var(--accent-light)" }} /> Nurture</div>
          </div>
          {data.followUpByIndustry.length === 0 ? <div style={{ fontSize: 14, color: "var(--text-dim)" }}>No follow-ups yet</div> :
            data.followUpByIndustry.map((r) => (
              <div key={r.name} className="mb-10">
                <div className="flex justify-between mb-4">
                  <span style={{ fontSize: 14 }}>{r.name}</span>
                  <span className="mono" style={{ fontSize: 14, color: "var(--text-muted)" }}>
                    <span style={{ color: "var(--warning-alt)" }}>{r.callBack}</span> / <span style={{ color: "var(--accent-light)" }}>{r.nurture}</span> · {r.rate}%
                  </span>
                </div>
                <MiniBar pct={r.rate} color="var(--accent-light)" />
              </div>
            ))}
        </div>
        <div className="card">
          <div className="card-title">Follow Up — by Channel</div>
          <div className="flex gap-16 mb-12">
            <div className="flex items-center gap-6" style={{ fontSize: 14, color: "var(--text-muted)" }}><div style={{ width: 8, height: 8, borderRadius: 2, background: "var(--warning-alt)" }} /> Call Back</div>
            <div className="flex items-center gap-6" style={{ fontSize: 14, color: "var(--text-muted)" }}><div style={{ width: 8, height: 8, borderRadius: 2, background: "var(--accent-light)" }} /> Nurture</div>
          </div>
          {data.followUpByChannel.length === 0 ? <div style={{ fontSize: 14, color: "var(--text-dim)" }}>No data yet</div> :
            data.followUpByChannel.map((r) => (
              <div key={r.name} className="mb-10">
                <div className="flex justify-between mb-4">
                  <span style={{ fontSize: 14 }}>{CHANNEL_ICONS[r.name]} {r.name}</span>
                  <span className="mono" style={{ fontSize: 14, color: "var(--text-muted)" }}>
                    <span style={{ color: "var(--warning-alt)" }}>{r.callBack}</span> / <span style={{ color: "var(--accent-light)" }}>{r.nurture}</span> · {r.rate}%
                  </span>
                </div>
                <MiniBar pct={r.rate} color="var(--accent-light)" />
              </div>
            ))}
        </div>
        <div className="card">
          <div className="card-title">Follow Up Pipeline</div>
          <div className="flex flex-col gap-16" style={{ paddingTop: 4 }}>
            {[
              { label: "Call Back", val: data.callBack, color: "var(--warning-alt)", bg: "var(--warning-bg)", desc: "Awaiting callback" },
              { label: "Nurture", val: data.nurture, color: "var(--accent-light)", bg: "var(--accent-bg)", desc: "Long-term nurture" },
              { label: "Trials", val: data.trials, color: "var(--info-bright)", bg: "var(--info-bg)", desc: "In trial phase" },
            ].map((item) => (
              <div key={item.label} style={{ padding: "12px 16px", borderRadius: 8, background: item.bg, border: `1px solid ${item.color}33`, cursor: "pointer" }}
                onClick={() => drill(item.label, (p) => p.status === item.label)}>
                <div className="flex justify-between items-center mb-4">
                  <span style={{ fontSize: 14, color: item.color, fontWeight: 600 }}>{item.label}</span>
                  <span style={{ fontSize: 23, fontWeight: 700, color: item.color }}>{item.val}</span>
                </div>
                <div className="mono" style={{ fontSize: 14, color: "var(--text-muted)" }}>{item.desc}</div>
                <div style={{ height: 3, background: "var(--border)", borderRadius: 2, marginTop: 8 }}>
                  <div style={{ height: "100%", width: `${data.total ? (item.val / data.total) * 100 : 0}%`, background: item.color, borderRadius: 2 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Channel effectiveness */}
      <div className="card">
        <div className="card-title">Channel Effectiveness — Reply Rate by Channel</div>
        <div className="channel-eff-grid">
          {data.channelReply.map((c) => (
            <div key={c.name} className="channel-eff-card" style={{ cursor: "pointer" }} onClick={() => drill(`Channel: ${c.name}`, (p) => p.touchpoints.some((t) => t.channel === c.name))}>
              <div style={{ fontSize: 21, marginBottom: 6 }}>{CHANNEL_ICONS[c.name]}</div>
              <div style={{ fontSize: 21, fontWeight: 700, color: c.rate > 30 ? "#34d399" : c.rate > 15 ? "#fbbf24" : "#f87171", marginBottom: 2 }}>{c.rate}%</div>
              <div className="mono" style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 8 }}>reply rate</div>
              <div style={{ height: 40, background: "var(--border)", borderRadius: 4, display: "flex", alignItems: "flex-end", overflow: "hidden" }}>
                <div style={{ width: "100%", height: `${c.rate}%`, background: c.rate > 30 ? "#34d399" : c.rate > 15 ? "#fbbf24" : "#f87171", opacity: 0.75 }} />
              </div>
              <div className="mono" style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 6 }}>{c.replied}/{c.touched} touched</div>
              <div className="mono" style={{ fontSize: 14, color: "var(--text-dim)" }}>{c.totalTp} total touches</div>
            </div>
          ))}
        </div>
      </div>

      {/* Activity + Industry + Weekly Trend */}
      <div className="analytics-grid-2-alt">
        <div className="card">
          <div className="card-title">Activity — Last 30 Days</div>
          <div className="flex gap-16 mb-12">
            <div className="flex items-center gap-6" style={{ fontSize: 14, color: "var(--text-muted)" }}><div style={{ width: 10, height: 10, borderRadius: 2, background: "#6366f1" }} /> Touchpoints</div>
            <div className="flex items-center gap-6" style={{ fontSize: 14, color: "var(--text-muted)" }}><div style={{ width: 10, height: 10, borderRadius: 2, background: "#34d399", opacity: 0.6 }} /> Added</div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 80 }}>
            {data.last30.map((d) => (
              <div key={d.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 1, height: "100%" }}>
                <div style={{ width: "80%", borderRadius: "2px 2px 0 0", height: Math.max((d.count / data.maxAct) * 70, d.count > 0 ? 3 : 0), background: "#6366f1", opacity: 0.9 }} title={`${d.count} touchpoints`} />
                <div style={{ width: "80%", borderRadius: "2px 2px 0 0", height: Math.max((d.added / data.maxAdded) * 20, d.added > 0 ? 2 : 0), background: "#34d399", opacity: 0.7 }} title={`${d.added} added`} />
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: "var(--border)", marginBottom: 6 }} />
          <div style={{ display: "flex", gap: 2 }}>
            {data.last30.map((d, i) => (
              <div key={d.key} style={{ flex: 1, textAlign: "center" }}>
                {i % 5 === 0 && <div className="mono" style={{ fontSize: 12, color: "var(--text-sec)" }}>{d.label}</div>}
              </div>
            ))}
          </div>
          {/* Weekly summary */}
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {data.weeklyActivity.map((w, i) => (
              <div key={i} style={{ padding: "8px 10px", borderRadius: 6, background: "var(--surface)", textAlign: "center" }}>
                <div className="mono" style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>{w.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--primary-light)" }}>{w.tpCount}</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>touches</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Industry Performance</div>
          <div className="flex flex-col">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 35px 45px 35px 35px", gap: 4, padding: "4px 0", borderBottom: "1px solid var(--border)", marginBottom: 6 }}>
              {["Industry", "#", "Reply", "Mtg", "NI"].map((h) => <div key={h} className="mono" style={{ fontSize: 12, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".06em" }}>{h}</div>)}
            </div>
            {data.industryStats.map((ind) => (
              <div key={ind.name} style={{ display: "grid", gridTemplateColumns: "1fr 35px 45px 35px 35px", gap: 4, padding: "7px 0", borderBottom: "1px solid var(--surface)", alignItems: "center", cursor: "pointer" }}
                onClick={() => drill(`Industry: ${ind.name}`, (p) => p.industry === ind.name)}>
                <div className="flex items-center gap-6"><div style={{ width: 7, height: 7, borderRadius: 2, background: ind.color, flexShrink: 0 }} /><span style={{ fontSize: 14, color: "var(--text-sec)" }}>{ind.name}</span></div>
                <div className="mono" style={{ fontSize: 14, color: "var(--text-muted)" }}>{ind.total}</div>
                <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: ind.replyRate > 30 ? "#34d399" : ind.replyRate > 15 ? "#fbbf24" : "#f87171" }}>{ind.replyRate}%</div>
                <div className="mono" style={{ fontSize: 14, color: "#a78bfa" }}>{ind.meetings}</div>
                <div className="mono" style={{ fontSize: 14, color: "var(--danger)" }}>{ind.notInterested}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hot prospects + List performance (NEW) */}
      <div className="analytics-grid-2">
        {data.hotProspects.length > 0 && (
          <div className="card">
            <div className="card-title">Hot Prospects — Closest to Conversion</div>
            <div className="flex flex-col gap-8">
              {data.hotProspects.map((p) => (
                <div key={p.id || p.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, background: "var(--surface)", cursor: onSelectProspect ? "pointer" : "default" }}
                  onClick={() => onSelectProspect && onSelectProspect(p.id)}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg, var(--primary), var(--accent))", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    {(p.name || "?")[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="truncate" style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                    <div className="truncate" style={{ fontSize: 12, color: "var(--text-muted)" }}>{p.company}</div>
                  </div>
                  <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 10, background: STATUS_COLORS[p.status]?.bg, color: STATUS_COLORS[p.status]?.text, border: `1px solid ${STATUS_COLORS[p.status]?.border}`, whiteSpace: "nowrap" }}>{p.status}</span>
                  <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)", flexShrink: 0 }}>{p.touchpoints.length} tp</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {data.listStats.length > 0 && (
          <div className="card">
            <div className="card-title">List Performance</div>
            <div className="flex flex-col">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 35px 45px 35px 35px", gap: 4, padding: "4px 0", borderBottom: "1px solid var(--border)", marginBottom: 6 }}>
                {["List", "#", "Reply", "Mtg", "NI"].map((h) => <div key={h} className="mono" style={{ fontSize: 12, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".06em" }}>{h}</div>)}
              </div>
              {data.listStats.map((ls) => (
                <div key={ls.name} style={{ display: "grid", gridTemplateColumns: "1fr 35px 45px 35px 35px", gap: 4, padding: "7px 0", borderBottom: "1px solid var(--surface)", alignItems: "center", cursor: "pointer" }}
                  onClick={() => drill(`List: ${ls.name}`, (p) => p.listName === ls.name)}>
                  <div className="truncate" style={{ fontSize: 14, color: "var(--text-sec)" }}>{ls.name}</div>
                  <div className="mono" style={{ fontSize: 14, color: "var(--text-muted)" }}>{ls.total}</div>
                  <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: ls.replyRate > 30 ? "#34d399" : ls.replyRate > 15 ? "#fbbf24" : "#f87171" }}>{ls.replyRate}%</div>
                  <div className="mono" style={{ fontSize: 14, color: "#a78bfa" }}>{ls.meetings}</div>
                  <div className="mono" style={{ fontSize: 14, color: "var(--danger)" }}>{ls.notInterested}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Touchpoint distribution */}
      <div className="card">
        <div className="card-title">Touchpoints Distribution — How Many Touches Before Outcome</div>
        <div className="touch-dist-grid">
          {data.buckets.map((b) => (
            <div key={b.label} className="touch-dist-card" style={{ cursor: "pointer" }} onClick={() => drill(b.label, b.filter)}>
              <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 6 }}>{b.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: b.color, letterSpacing: "-0.03em" }}>{b.count}</div>
              <div className="mono" style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 10 }}>prospects</div>
              <div style={{ height: 4, background: "var(--border)", borderRadius: 2, marginBottom: 6 }}>
                <div style={{ height: "100%", width: `${data.total ? (b.count / data.total) * 100 : 0}%`, background: b.color, borderRadius: 2 }} />
              </div>
              <div className="flex justify-between">
                <span className="mono" style={{ fontSize: 14, color: "var(--text-muted)" }}>reply rate</span>
                <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: b.replyRate > 30 ? "#34d399" : b.replyRate > 10 ? "#fbbf24" : "#f87171" }}>{b.replyRate}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      </>}

      {/* Drilldown modal */}
      {drilldown && (
        <DrilldownModal
          title={drilldown.title}
          prospects={drilldown.prospects}
          onClose={() => setDrilldown(null)}
          onSelectProspect={onSelectProspect ? (id) => { setDrilldown(null); onSelectProspect(id); } : null}
        />
      )}
    </div>
  );
}
