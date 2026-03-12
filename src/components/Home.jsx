import { useState, useMemo, useRef } from "react";
import { useStore } from "../store";
import { supabase } from "../supabase";
import { STATUSES, STATUS_COLORS } from "../constants";
import { daysSinceLast, greeting, stalenessColor, todayStr } from "../utils";
import { Badge } from "./ui";

function ProspectRow({ p, onSelect, avatarBg = "linear-gradient(135deg, #6366f1, #8b5cf6)", avatarColor = "#fff", extra }) {
  return (
    <div className="home-prospect-row" onClick={() => onSelect(p.id)}>
      <div className="home-prospect-avatar" style={{ background: avatarBg, color: avatarColor }}>{p.name[0]}</div>
      <div className="flex-1" style={{ minWidth: 0 }}>
        <div className="truncate" style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
        <div style={{ fontSize: 14, color: "var(--text-muted)" }}>{p.company}</div>
      </div>
      {extra || <Badge status={p.status} />}
    </div>
  );
}

export default function Home({ onNavigate, onSelect, onLogTouchpoint, onAdd }) {
  const { state, stats, allLists, tasksToday, overdueProspects, exportBackup, importBackup } = useStore();
  const { prospects } = state;
  const [listSearch, setListSearch] = useState("");
  const [listDetail, setListDetail] = useState(null);
  const [importStatus, setImportStatus] = useState(null); // null | "ok:{n}" | "err:{msg}"
  const fileInputRef = useRef(null);

  /* Morning digest — dismissible per day */
  const [digestDismissed, setDigestDismissed] = useState(
    () => localStorage.getItem("outreach-digest-dismissed") === todayStr()
  );
  function dismissDigest() {
    localStorage.setItem("outreach-digest-dismissed", todayStr());
    setDigestDismissed(true);
  }
  const showDigest = !digestDismissed && prospects.length > 0 && (
    tasksToday.length > 0 || stats.needsTouch3 > 0 || stats.meetings > 0
  );

  const recentProspects = useMemo(() => [...prospects].sort((a, b) => b.id - a.id).slice(0, 5), [prospects]);
  const hotProspects = useMemo(() => prospects.filter((p) => ["Replied", "Meeting Booked"].includes(p.status)).slice(0, 5), [prospects]);
  const needsAttention = useMemo(() => prospects.filter((p) => { const d = daysSinceLast(p); return d !== null && d >= 3; }).slice(0, 5), [prospects]);

  const addedThisWeek = useMemo(() => {
    const week = new Date(); week.setDate(week.getDate() - 7);
    const wStr = week.toISOString().slice(0, 10);
    return prospects.filter((p) => p.createdAt >= wStr).length;
  }, [prospects]);

  const listsData = useMemo(() => {
    return allLists.map((name) => {
      const members = prospects.filter((p) => p.listName === name);
      const statusCounts = {};
      STATUSES.forEach((s) => { statusCounts[s] = members.filter((p) => p.status === s).length; });
      const replied = members.filter((p) => ["Replied", "Meeting Booked"].includes(p.status)).length;
      const meetings = members.filter((p) => p.status === "Meeting Booked").length;
      const needsTouch = members.filter((p) => { const d = daysSinceLast(p); return d !== null && d >= 7; }).length;
      return { name, members, statusCounts, replied, meetings, needsTouch, replyRate: members.length ? Math.round((replied / members.length) * 100) : 0 };
    });
  }, [allLists, prospects]);

  const kpis = [
    { label: "Total Prospects", val: prospects.length, accent: "#6366f1", icon: "👥", sub: `+${addedThisWeek} this week` },
    { label: "Tasks Due", val: tasksToday.length, accent: tasksToday.length > 0 ? "#ef4444" : "#34d399", icon: "✅", sub: tasksToday.length > 0 ? "needs action" : "all clear", click: () => onNavigate("tasks") },
    { label: "Reply Rate", val: `${stats.replyRate}%`, accent: "#34d399", icon: "💬", sub: `${stats.replied} replied` },
    { label: "Meetings", val: stats.meetings, accent: "#a78bfa", icon: "📅", sub: "booked" },
    { label: "Win Rate", val: `${stats.winRate}%`, accent: "#4ade80", icon: "🏆", sub: `${stats.won} won` },
    { label: "Stale 3d+", val: stats.needsTouch3, accent: stats.needsTouch3 > 0 ? "#fb923c" : "#4b5563", icon: "⏰", sub: "need a touch", click: () => onNavigate("list", { dormant: "3" }) },
  ];

  /* ── List detail drill-down ── */
  if (listDetail) {
    const l = listsData.find((x) => x.name === listDetail);
    if (!l) { setListDetail(null); return null; }
    return (
      <div style={{ padding: "24px 32px" }}>
        <div className="flex items-center gap-12 mb-20">
          <button className="btn btn-ghost" onClick={() => setListDetail(null)}>← Back</button>
          <div style={{ fontSize: 17, fontWeight: 700 }}>📋 {l.name}</div>
          <button className="btn btn-outline ml-auto" onClick={() => { onNavigate("list", { list: l.name }); setListDetail(null); }}>
            Filter to this list →
          </button>
        </div>
        <div className="flex gap-12 mb-20">
          {[
            { label: "Prospects", val: l.members.length, color: "#a5b4fc" },
            { label: "Reply Rate", val: `${l.replyRate}%`, color: "#34d399" },
            { label: "Meetings", val: l.meetings, color: "#a78bfa" },
            { label: "Stale 7d+", val: l.needsTouch, color: l.needsTouch > 0 ? "#f97316" : "#4b5563" },
          ].map((s) => (
            <div key={s.label} className="stat-card" style={{ flex: 1 }}>
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>
        <table className="table">
          <thead><tr>{["Prospect", "Company", "Status", "Touchpoints", "Last Activity"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {l.members.map((p) => {
              const d = daysSinceLast(p);
              return (
                <tr key={p.id} onClick={() => { onSelect(p.id); setListDetail(null); }}>
                  <td><div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div><div style={{ fontSize: 14, color: "var(--text-muted)" }}>{p.title}</div></td>
                  <td style={{ fontSize: 14, color: "var(--text-sec)" }}>{p.company}</td>
                  <td><Badge status={p.status} /></td>
                  <td className="mono" style={{ fontSize: 14, color: "var(--text-sec)" }}>{p.touchpoints.length}</td>
                  <td className="mono" style={{ fontSize: 14, color: stalenessColor(d) }}>{d === null ? "—" : d === 0 ? "Today" : `${d}d ago`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 32px" }}>
      {/* Welcome */}
      <div className="mb-24" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4 }}>
            Good {greeting()} 👋
          </div>
          <div style={{ fontSize: 14, color: "var(--text-muted)" }}>
            Here's your pipeline at a glance · {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </div>
        </div>
        {onAdd && <button className="btn btn-primary" onClick={onAdd}>+ Add Prospect</button>}
      </div>

      {/* Morning Digest */}
      {showDigest && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ fontSize: 18 }}>☀️</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Today's Briefing</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px" }}>
              {tasksToday.length > 0 && (
                <span style={{ fontSize: 13, color: "var(--primary-light)", cursor: "pointer" }} onClick={() => onNavigate("tasks")}>
                  ✅ <strong>{tasksToday.length}</strong> task{tasksToday.length > 1 ? "s" : ""} due
                </span>
              )}
              {stats.needsTouch3 > 0 && (
                <span style={{ fontSize: 13, color: "#fb923c", cursor: "pointer" }} onClick={() => onNavigate("list", { dormant: "3" })}>
                  ⏰ <strong>{stats.needsTouch3}</strong> prospect{stats.needsTouch3 > 1 ? "s" : ""} need a nudge
                </span>
              )}
              {stats.meetings > 0 && (
                <span style={{ fontSize: 13, color: "#a78bfa" }}>
                  📅 <strong>{stats.meetings}</strong> meeting{stats.meetings > 1 ? "s" : ""} booked
                </span>
              )}
            </div>
          </div>
          <button onClick={dismissDigest} style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", padding: "4px 8px", borderRadius: 6 }}
            title="Dismiss until tomorrow">
            Dismiss ×
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="kpi-grid">
        {kpis.map((k) => (
          <div key={k.label} className={`kpi-card${k.click ? " clickable" : ""}`} onClick={k.click}>
            <div className="kpi-icon">{k.icon}</div>
            <div className="kpi-val" style={{ color: k.accent }}>{k.val}</div>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Three panels */}
      <div className="home-panels">
        {/* Recently Added */}
        <div className="home-panel">
          <div className="home-panel-header">
            <div className="home-panel-title">Recently Added</div>
            <button className="home-panel-link" onClick={() => onNavigate("list")}>View all →</button>
          </div>
          {recentProspects.length === 0
            ? <div style={{ fontSize: 14, color: "var(--text-dim)" }}>No prospects yet</div>
            : <div className="flex flex-col gap-10">{recentProspects.map((p) => <ProspectRow key={p.id} p={p} onSelect={onSelect} />)}</div>
          }
        </div>

        {/* Hot */}
        <div className="home-panel">
          <div className="home-panel-header">
            <div className="home-panel-title">🔥 Hot Prospects</div>
          </div>
          {hotProspects.length === 0
            ? <div style={{ fontSize: 14, color: "var(--text-dim)" }}>No hot prospects yet — keep reaching out!</div>
            : <div className="flex flex-col gap-10">
                {hotProspects.map((p) => (
                  <ProspectRow key={p.id} p={p} onSelect={onSelect} avatarBg="#0d2e1a" avatarColor="#4ade80" />
                ))}
              </div>
          }
        </div>

        {/* Needs attention */}
        <div className="home-panel">
          <div className="home-panel-header">
            <div className="home-panel-title">⏰ Needs Attention</div>
          </div>
          {needsAttention.length === 0
            ? <div style={{ fontSize: 14, color: "#34d399" }}>All prospects touched in the last 3 days 🎉</div>
            : <div className="flex flex-col gap-10">
                {needsAttention.map((p) => {
                  const d = daysSinceLast(p);
                  const c = stalenessColor(d);
                  return (
                    <ProspectRow key={p.id} p={p} onSelect={onSelect} avatarBg="#1a1a2e" avatarColor={c}
                      extra={<span className="mono nowrap" style={{ fontSize: 14, color: c }}>{d}d ago</span>}
                    />
                  );
                })}
              </div>
          }
        </div>
      </div>

      {/* Pipeline bar */}
      <div className="card mb-24">
        <div className="card-title">Pipeline Overview</div>
        <div className="pipeline-bar">
          {STATUSES.map((s) => {
            const cnt = prospects.filter((p) => p.status === s).length;
            const pct = prospects.length ? (cnt / prospects.length) * 100 : 0;
            return pct > 0 ? <div key={s} title={`${s}: ${cnt}`} style={{ width: `${pct}%`, background: STATUS_COLORS[s].text, opacity: 0.85 }} /> : null;
          })}
        </div>
        <div className="pipeline-legend">
          {STATUSES.filter((s) => prospects.filter((p) => p.status === s).length > 0).map((s) => {
            const cnt = prospects.filter((p) => p.status === s).length;
            return (
              <div key={s} className="pipeline-legend-item" onClick={() => onNavigate("list", { statuses: [s] })}>
                <div className="pipeline-legend-dot" style={{ background: STATUS_COLORS[s].text }} />
                <span className="pipeline-legend-label">{s}</span>
                <span className="pipeline-legend-count">{cnt}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Data Backup */}
      <div className="card mb-24" style={{ borderColor: "var(--border)" }}>
        <div className="card-title">Data Backup</div>
        <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>
          {supabase
            ? "Your data is synced to the cloud and cached locally — it survives re-logins and new deployments. Export a backup to move data to another account or keep an offline copy."
            : "Your data lives in your browser's IndexedDB — new deployments never touch it. Export a backup before major changes, or to move data to another device."}
        </div>
        <div className="flex gap-10 items-center flex-wrap">
          <button
            className="btn btn-outline btn-sm"
            onClick={exportBackup}
            title="Download all prospects, sequences, and enrollments as JSON"
          >
            ⬇ Export Backup
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => fileInputRef.current?.click()}
            title="Restore from a previously exported JSON backup"
          >
            ⬆ Import Backup
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              e.target.value = "";
              try {
                const n = await importBackup(file);
                setImportStatus(`ok:${n}`);
                setTimeout(() => setImportStatus(null), 4000);
              } catch (err) {
                setImportStatus(`err:${err.message}`);
                setTimeout(() => setImportStatus(null), 5000);
              }
            }}
          />
          {importStatus?.startsWith("ok:") && (
            <span style={{ fontSize: 13, color: "#34d399", fontWeight: 600 }}>
              ✓ Restored {importStatus.slice(3)} prospects
            </span>
          )}
          {importStatus?.startsWith("err:") && (
            <span style={{ fontSize: 13, color: "#f87171" }}>
              ✕ {importStatus.slice(4)}
            </span>
          )}
        </div>
        <div className="mono" style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 12 }}>
          {state.prospects.length} prospects · {state.sequences.length} sequences · {state.enrollments.length} enrollments stored locally
        </div>
      </div>

      {/* Lists */}
      <div>
        <div className="flex items-center justify-between mb-16">
          <div style={{ fontSize: 15, fontWeight: 700 }}>📋 Lists</div>
          <input
            className="form-input"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            placeholder="Search lists…"
            style={{ width: 180 }}
          />
        </div>
        {listsData.length === 0 && (
          <div className="empty"><div className="empty-msg">No lists yet — assign a list name when adding or importing prospects</div></div>
        )}
        <div className="lists-grid">
          {listsData.filter((l) => !listSearch || l.name.toLowerCase().includes(listSearch.toLowerCase())).map((l) => (
            <div key={l.name} className="list-card" onClick={() => setListDetail(l.name)}>
              <div className="flex items-start justify-between mb-10">
                <div style={{ fontSize: 15, fontWeight: 700 }}>📋 {l.name}</div>
                <div style={{ fontSize: 21, fontWeight: 700, color: "#a5b4fc" }}>{l.members.length}</div>
              </div>
              <div className="pipeline-bar" style={{ marginBottom: 10, height: 5, borderRadius: 3 }}>
                {STATUSES.map((s) => {
                  const pct = l.members.length ? (l.statusCounts[s] / l.members.length) * 100 : 0;
                  return pct > 0 ? <div key={s} style={{ width: `${pct}%`, background: STATUS_COLORS[s].text, opacity: 0.8 }} /> : null;
                })}
              </div>
              <div className="flex gap-16">
                <div><span style={{ fontSize: 15, fontWeight: 700, color: "#34d399" }}>{l.replyRate}%</span><div className="mono" style={{ fontSize: 14, color: "var(--text-muted)" }}>replies</div></div>
                <div><span style={{ fontSize: 15, fontWeight: 700, color: "#a78bfa" }}>{l.meetings}</span><div className="mono" style={{ fontSize: 14, color: "var(--text-muted)" }}>meetings</div></div>
                {l.needsTouch > 0 && <div className="ml-auto"><span style={{ fontSize: 15, fontWeight: 700, color: "#f97316" }}>{l.needsTouch}</span><div className="mono" style={{ fontSize: 14, color: "#f97316" }}>stale</div></div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
