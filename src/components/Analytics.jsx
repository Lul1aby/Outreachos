import { useMemo, useState, useCallback } from "react";
import { useStore } from "../store";
import { STATUSES, INDUSTRIES, CHANNELS, STATUS_COLORS, CHANNEL_ICONS } from "../constants";
import { fmtDate, daysSinceLast } from "../utils";
import { MiniBar } from "./ui";

function escapeCSV(val) {
  if (val === null || val === undefined) return "";
  const s = String(val);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function Analytics() {
  const { state, allLists } = useStore();
  const [selectedList, setSelectedList] = useState("__all__");

  const downloadReport = useCallback(() => {
    const src = selectedList === "__all__" ? state.prospects : state.prospects.filter((p) => p.listName === selectedList);
    const rows = [
      ["Name", "Company", "Title", "Industry", "Status", "List", "Email", "Phone", "LinkedIn", "Created", "Touchpoints", "Last Touch Date", "Days Since Last Touch", "Channels Used"],
      ...src.map((p) => {
        const days = daysSinceLast(p);
        const lastTouch = p.touchpoints.length ? [...p.touchpoints].sort((a, b) => a.date.localeCompare(b.date)).at(-1).date : "";
        const channels = [...new Set(p.touchpoints.map((t) => t.channel))].join("; ");
        return [
          p.name, p.company, p.title || "", p.industry || "", p.status, p.listName || "",
          p.email || "", p.phone || "", p.linkedin || "",
          fmtDate(p.createdAt), p.touchpoints.length,
          lastTouch ? fmtDate(lastTouch) : "", days !== null ? days : "",
          channels,
        ];
      }),
    ];
    const csv = rows.map((r) => r.map(escapeCSV).join(",")).join("\n");
    const label = selectedList === "__all__" ? "all-prospects" : selectedList.replace(/\s+/g, "-").toLowerCase();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `outreach-report-${label}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state.prospects, selectedList]);
  const prospects = useMemo(() => {
    if (selectedList === "__all__") return state.prospects;
    return state.prospects.filter((p) => p.listName === selectedList);
  }, [state.prospects, selectedList]);

  const data = useMemo(() => {
    const total = prospects.length;
    const allTp = prospects.flatMap((p) => p.touchpoints);

    /* Status / industry / channel counts */
    const statusCounts = {};
    STATUSES.forEach((s) => { statusCounts[s] = prospects.filter((p) => p.status === s).length; });
    const byChannel = {};
    CHANNELS.forEach((c) => { byChannel[c] = allTp.filter((t) => t.channel === c).length; });

    /* Funnel */
    const contacted = prospects.filter((p) => p.touchpoints.length > 0).length;
    const replied = prospects.filter((p) => ["Replied", "Meeting Booked", "Opportunity"].includes(p.status)).length;
    const meeting = prospects.filter((p) => ["Meeting Booked", "Opportunity"].includes(p.status)).length;
    const won = prospects.filter((p) => p.status === "Opportunity").length;
    const notInt = prospects.filter((p) => p.status === "Not Interested").length;
    const noResp = prospects.filter((p) => p.status === "No Response").length;
    const callBack = prospects.filter((p) => p.status === "Call Back").length;
    const nurture = prospects.filter((p) => p.status === "Nurture").length;
    const trials = prospects.filter((p) => p.status === "Trials").length;
    const closedNeg = notInt + noResp;

    const funnelSteps = [
      { label: "Total", val: total, color: "#6366f1", pct: 100 },
      { label: "Touched", val: contacted, color: "#60a5fa", pct: total ? Math.round((contacted / total) * 100) : 0 },
      { label: "Replied", val: replied, color: "#34d399", pct: total ? Math.round((replied / total) * 100) : 0 },
      { label: "Meeting", val: meeting, color: "#a78bfa", pct: total ? Math.round((meeting / total) * 100) : 0 },
      { label: "Opportunity", val: won, color: "#4ade80", pct: total ? Math.round((won / total) * 100) : 0 },
    ];

    const dropOffs = [
      { from: "Touched→Replied", lost: contacted - replied, rate: contacted ? Math.round((1 - replied / contacted) * 100) : 0 },
      { from: "Replied→Meeting", lost: replied - meeting, rate: replied ? Math.round((1 - meeting / replied) * 100) : 0 },
      { from: "Meeting→Opportunity", lost: meeting - won, rate: meeting ? Math.round((1 - won / meeting) * 100) : 0 },
    ];

    /* Rejection by industry/channel */
    const rejByIndustry = INDUSTRIES.map((i) => {
      const ind = prospects.filter((p) => p.industry === i);
      const neg = ind.filter((p) => ["Not Interested", "No Response"].includes(p.status)).length;
      return { name: i, total: ind.length, neg, rate: ind.length ? Math.round((neg / ind.length) * 100) : 0 };
    }).filter((r) => r.neg > 0).sort((a, b) => b.rate - a.rate);

    const rejByChannel = CHANNELS.map((c) => {
      const touched = prospects.filter((p) => p.touchpoints.some((t) => t.channel === c));
      const neg = touched.filter((p) => ["Not Interested", "No Response"].includes(p.status)).length;
      return { name: c, total: touched.length, neg, rate: touched.length ? Math.round((neg / touched.length) * 100) : 0 };
    }).filter((r) => r.total > 0).sort((a, b) => b.rate - a.rate);

    /* Follow Up by industry/channel */
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

    /* Channel reply rate */
    const channelReply = CHANNELS.map((c) => {
      const touched = prospects.filter((p) => p.touchpoints.some((t) => t.channel === c));
      const r = touched.filter((p) => ["Replied", "Meeting Booked", "Opportunity"].includes(p.status)).length;
      return { name: c, touched: touched.length, replied: r, rate: touched.length ? Math.round((r / touched.length) * 100) : 0, totalTp: byChannel[c] };
    }).filter((c) => c.touched > 0).sort((a, b) => b.rate - a.rate);

    /* Touchpoints → reply */
    const withReply = prospects.filter((p) => ["Replied", "Meeting Booked", "Opportunity"].includes(p.status));
    const avgTpToReply = withReply.length ? Math.round((withReply.reduce((a, p) => a + p.touchpoints.length, 0) / withReply.length) * 10) / 10 : 0;
    const avgTpAll = total ? Math.round((prospects.reduce((a, p) => a + p.touchpoints.length, 0) / total) * 10) / 10 : 0;

    /* Velocity */
    const velocities = withReply.map((p) => {
      const dates = p.touchpoints.map((t) => new Date(t.date)).sort((a, b) => a - b);
      return dates.length ? Math.round((dates[dates.length - 1] - new Date(p.createdAt)) / 86400000) : null;
    }).filter((v) => v !== null);
    const avgVelocity = velocities.length ? Math.round(velocities.reduce((a, b) => a + b, 0) / velocities.length) : 0;

    /* Activity last 30 days */
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

    /* Industry performance */
    const IND_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#60a5fa", "#34d399", "#fbbf24", "#f97316", "#f87171"];
    const industryStats = INDUSTRIES.filter((i) => prospects.filter((p) => p.industry === i).length > 0).map((i, idx) => {
      const ind = prospects.filter((p) => p.industry === i);
      const r = ind.filter((p) => ["Replied", "Meeting Booked", "Opportunity"].includes(p.status)).length;
      const m = ind.filter((p) => ["Meeting Booked", "Opportunity"].includes(p.status)).length;
      return { name: i, total: ind.length, replied: r, meetings: m, replyRate: ind.length ? Math.round((r / ind.length) * 100) : 0, color: IND_COLORS[idx % IND_COLORS.length] };
    }).sort((a, b) => b.replyRate - a.replyRate);

    /* Touchpoint distribution buckets (non-overlapping: upper bound exclusive except last) */
    const buckets = [
      { label: "0–5 touches",  filter: (p) => p.touchpoints.length <= 5, color: "#60a5fa" },
      { label: "5–10 touches", filter: (p) => p.touchpoints.length > 5 && p.touchpoints.length <= 10, color: "#a78bfa" },
      { label: "10–15 touches", filter: (p) => p.touchpoints.length > 10 && p.touchpoints.length <= 15, color: "#fbbf24" },
      { label: "15+ touches",  filter: (p) => p.touchpoints.length > 15, color: "#f97316" },
    ].map((b) => {
      const group = prospects.filter(b.filter);
      const r = group.filter((p) => ["Replied", "Meeting Booked", "Opportunity"].includes(p.status)).length;
      return { ...b, count: group.length, replyRate: group.length ? Math.round((r / group.length) * 100) : 0 };
    });

    return {
      total, allTp, statusCounts, funnelSteps, dropOffs, noResp, notInt, closedNeg,
      callBack, nurture, trials, followUpByIndustry, followUpByChannel,
      rejByIndustry, rejByChannel, channelReply, byChannel,
      avgTpToReply, avgTpAll, avgVelocity, meeting, won, contacted, replied,
      last30, maxAct, maxAdded, industryStats, buckets,
    };
  }, [prospects]);

  if (state.prospects.length === 0) {
    return (
      <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, gap: 12, textAlign: "center" }}>
        <div style={{ fontSize: 42 }}>📊</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>No data yet</div>
        <div style={{ fontSize: 14, color: "var(--text-muted)", maxWidth: 320 }}>Add prospects or import a CSV to start seeing analytics.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 32px" }} className="flex flex-col gap-20">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-12">
        <div>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 2 }}>📊 Analytics</div>
          <div className="mono" style={{ fontSize: 14, color: "var(--text-muted)" }}>{data.total} prospects · {data.allTp.length} touchpoints logged</div>
        </div>
        <div className="flex items-center gap-8 flex-wrap">
          <span className="mono" style={{ fontSize: 14, color: "var(--text-muted)" }}>Analysing:</span>
          <select
            className="form-select"
            style={{ marginBottom: 0, minWidth: 180, fontSize: 14 }}
            value={selectedList}
            onChange={(e) => setSelectedList(e.target.value)}
          >
            <option value="__all__">All Prospects</option>
            {allLists.map((l) => <option key={l} value={l}>📋 {l}</option>)}
          </select>
          <button className="btn btn-outline btn-sm" onClick={downloadReport} title="Download activity report as CSV" style={{ whiteSpace: "nowrap" }}>
            ⬇ Download Report
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="analytics-kpi-row">
        {[
          { label: "Total", val: data.total, color: "#6366f1" },
          { label: "Touched", val: data.contacted, color: "#60a5fa" },
          { label: "Reply Rate", val: `${data.total ? Math.round((data.replied / data.total) * 100) : 0}%`, color: "#34d399" },
          { label: "Meetings", val: data.meeting, color: "#a78bfa" },
          { label: "Opportunity", val: data.won, color: "#4ade80" },
          { label: "Trials", val: data.trials, color: "#38bdf8" },
          { label: "Call Back", val: data.callBack, color: "#f97316" },
          { label: "Nurture", val: data.nurture, color: "#c084fc" },
          { label: "Not Interested", val: data.notInt, color: "#f87171" },
          { label: "Avg Touches→Reply", val: data.avgTpToReply || "—", color: "#fbbf24" },
        ].map((k) => (
          <div key={k.label} className="analytics-kpi">
            <div className="analytics-kpi-val" style={{ color: k.color }}>{k.val}</div>
            <div className="analytics-kpi-label">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Funnel + Drop-offs */}
      <div className="analytics-grid-2">
        <div className="card">
          <div className="card-title">Conversion Funnel</div>
          <div className="flex flex-col gap-10">
            {data.funnelSteps.map((f) => (
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
                { label: "No Response", val: data.noResp, color: "#fbbf24" },
                { label: "Not Interested", val: data.notInt, color: "#f87171" },
                { label: "Call Back", val: data.callBack, color: "#f97316" },
                { label: "Nurture", val: data.nurture, color: "#c084fc" },
              ].map((x) => (
                <div key={x.label} className="flex flex-col gap-4">
                  <div style={{ fontSize: 15, fontWeight: 700, color: x.color }}>{x.val}</div>
                  <div className="mono" style={{ fontSize: 14, color: "var(--text-muted)" }}>{x.label}</div>
                </div>
              ))}
              <div className="ml-auto flex flex-col gap-4">
                <div style={{ fontSize: 15, fontWeight: 700, color: "#ef4444" }}>{data.total ? Math.round((data.closedNeg / data.total) * 100) : 0}%</div>
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
                  <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: d.rate > 60 ? "#ef4444" : d.rate > 30 ? "#f97316" : "#34d399" }}>{d.rate}% drop</span>
                </div>
                <MiniBar pct={d.rate} color={d.rate > 60 ? "#ef4444" : d.rate > 30 ? "#f97316" : "#34d399"} height={6} />
                <div className="mono" style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 4 }}>{d.lost} prospects lost here</div>
              </div>
            ))}
            <div className="pt-12 border-t">
              <div className="mono" style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 4 }}>Avg velocity (add → reply)</div>
              <div style={{ fontSize: 23, fontWeight: 700, color: "#a5b4fc" }}>{data.avgVelocity ? `${data.avgVelocity}d` : "—"}</div>
              <div style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 2 }}>{data.avgTpAll} avg touchpoints per prospect</div>
            </div>
          </div>
        </div>
      </div>

      {/* Rejection analysis */}
      <div className="analytics-grid-3">
        <div className="card">
          <div className="card-title">❌ Not Interested — by Industry</div>
          {data.rejByIndustry.length === 0 ? <div style={{ fontSize: 14, color: "var(--text-dim)" }}>No rejections yet 🎉</div> :
            data.rejByIndustry.map((r) => (
              <div key={r.name} className="mb-10">
                <div className="flex justify-between mb-4"><span style={{ fontSize: 14 }}>{r.name}</span><span className="mono" style={{ fontSize: 14, color: r.rate > 50 ? "#f87171" : "var(--text-muted)" }}>{r.neg}/{r.total} · {r.rate}%</span></div>
                <MiniBar pct={r.rate} color={r.rate > 50 ? "#ef4444" : r.rate > 25 ? "#f97316" : "#fbbf24"} />
              </div>
            ))}
        </div>
        <div className="card">
          <div className="card-title">❌ Not Interested — by Channel</div>
          {data.rejByChannel.length === 0 ? <div style={{ fontSize: 14, color: "var(--text-dim)" }}>No data yet</div> :
            data.rejByChannel.map((r) => (
              <div key={r.name} className="mb-10">
                <div className="flex justify-between mb-4"><span style={{ fontSize: 14 }}>{CHANNEL_ICONS[r.name]} {r.name}</span><span className="mono" style={{ fontSize: 14, color: r.rate > 50 ? "#f87171" : "var(--text-muted)" }}>{r.neg}/{r.total} · {r.rate}%</span></div>
                <MiniBar pct={r.rate} color={r.rate > 50 ? "#ef4444" : r.rate > 25 ? "#f97316" : "#fbbf24"} />
              </div>
            ))}
        </div>
        <div className="card">
          <div className="card-title">All Status Distribution</div>
          {STATUSES.map((s) => {
            const cnt = data.statusCounts[s];
            const pct = data.total ? (cnt / data.total) * 100 : 0;
            return (
              <div key={s} className="mb-8">
                <div className="flex justify-between mb-4"><span style={{ fontSize: 14, color: STATUS_COLORS[s].text }}>{s}</span><span className="mono" style={{ fontSize: 14, color: "var(--text-muted)" }}>{cnt} · {Math.round(pct)}%</span></div>
                <MiniBar pct={pct} color={STATUS_COLORS[s].text} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Follow Up analysis */}
      <div className="analytics-grid-3">
        <div className="card">
          <div className="card-title">🔄 Follow Up — by Industry</div>
          <div className="flex gap-16 mb-12">
            <div className="flex items-center gap-6" style={{ fontSize: 14, color: "var(--text-muted)" }}><div style={{ width: 8, height: 8, borderRadius: 2, background: "#f97316" }} /> Call Back</div>
            <div className="flex items-center gap-6" style={{ fontSize: 14, color: "var(--text-muted)" }}><div style={{ width: 8, height: 8, borderRadius: 2, background: "#c084fc" }} /> Nurture</div>
          </div>
          {data.followUpByIndustry.length === 0 ? <div style={{ fontSize: 14, color: "var(--text-dim)" }}>No follow-ups yet</div> :
            data.followUpByIndustry.map((r) => (
              <div key={r.name} className="mb-10">
                <div className="flex justify-between mb-4">
                  <span style={{ fontSize: 14 }}>{r.name}</span>
                  <span className="mono" style={{ fontSize: 14, color: "var(--text-muted)" }}>
                    <span style={{ color: "#f97316" }}>{r.callBack}</span> / <span style={{ color: "#c084fc" }}>{r.nurture}</span> · {r.rate}%
                  </span>
                </div>
                <MiniBar pct={r.rate} color="#c084fc" />
              </div>
            ))}
        </div>
        <div className="card">
          <div className="card-title">🔄 Follow Up — by Channel</div>
          <div className="flex gap-16 mb-12">
            <div className="flex items-center gap-6" style={{ fontSize: 14, color: "var(--text-muted)" }}><div style={{ width: 8, height: 8, borderRadius: 2, background: "#f97316" }} /> Call Back</div>
            <div className="flex items-center gap-6" style={{ fontSize: 14, color: "var(--text-muted)" }}><div style={{ width: 8, height: 8, borderRadius: 2, background: "#c084fc" }} /> Nurture</div>
          </div>
          {data.followUpByChannel.length === 0 ? <div style={{ fontSize: 14, color: "var(--text-dim)" }}>No data yet</div> :
            data.followUpByChannel.map((r) => (
              <div key={r.name} className="mb-10">
                <div className="flex justify-between mb-4">
                  <span style={{ fontSize: 14 }}>{CHANNEL_ICONS[r.name]} {r.name}</span>
                  <span className="mono" style={{ fontSize: 14, color: "var(--text-muted)" }}>
                    <span style={{ color: "#f97316" }}>{r.callBack}</span> / <span style={{ color: "#c084fc" }}>{r.nurture}</span> · {r.rate}%
                  </span>
                </div>
                <MiniBar pct={r.rate} color="#c084fc" />
              </div>
            ))}
        </div>
        <div className="card">
          <div className="card-title">📋 Follow Up Pipeline</div>
          <div className="flex flex-col gap-16" style={{ paddingTop: 4 }}>
            {[
              { label: "Call Back", val: data.callBack, color: "#f97316", bg: "#2a1800", desc: "Awaiting callback" },
              { label: "Nurture", val: data.nurture, color: "#c084fc", bg: "#1e1a2e", desc: "Long-term nurture" },
              { label: "Trials", val: data.trials, color: "#38bdf8", bg: "#0d2238", desc: "In trial phase" },
            ].map((item) => (
              <div key={item.label} style={{ padding: "12px 16px", borderRadius: 8, background: item.bg, border: `1px solid ${item.color}33` }}>
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
            <div key={c.name} className="channel-eff-card">
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

      {/* Activity + Industry */}
      <div className="analytics-grid-2-alt">
        <div className="card">
          <div className="card-title">Activity — Last 30 Days</div>
          <div className="flex gap-16 mb-12">
            <div className="flex items-center gap-6" style={{ fontSize: 14, color: "var(--text-muted)" }}><div style={{ width: 10, height: 10, borderRadius: 2, background: "#6366f1" }} /> Touchpoints</div>
            <div className="flex items-center gap-6" style={{ fontSize: 14, color: "var(--text-muted)" }}><div style={{ width: 10, height: 10, borderRadius: 2, background: "#34d399", opacity: 0.6 }} /> Added</div>
          </div>
          {/* Bars area */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 80 }}>
            {data.last30.map((d) => (
              <div key={d.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 1, height: "100%" }}>
                <div style={{ width: "80%", borderRadius: "2px 2px 0 0", height: Math.max((d.count / data.maxAct) * 70, d.count > 0 ? 3 : 0), background: "#6366f1", opacity: 0.9 }} title={`${d.count} touchpoints`} />
                <div style={{ width: "80%", borderRadius: "2px 2px 0 0", height: Math.max((d.added / data.maxAdded) * 20, d.added > 0 ? 2 : 0), background: "#34d399", opacity: 0.7 }} title={`${d.added} added`} />
              </div>
            ))}
          </div>
          {/* Baseline */}
          <div style={{ height: 1, background: "var(--border)", marginBottom: 6 }} />
          {/* Date labels - horizontal, always at bottom */}
          <div style={{ display: "flex", gap: 2 }}>
            {data.last30.map((d, i) => (
              <div key={d.key} style={{ flex: 1, textAlign: "center" }}>
                {i % 5 === 0 && (
                  <div className="mono" style={{ fontSize: 12, color: "var(--text-sec)" }}>{d.label}</div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Industry Performance</div>
          <div className="flex flex-col">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 40px 50px 50px", gap: 4, padding: "4px 0", borderBottom: "1px solid var(--border)", marginBottom: 6 }}>
              {["Industry", "#", "Reply", "Mtg"].map((h) => <div key={h} className="mono" style={{ fontSize: 14, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".06em" }}>{h}</div>)}
            </div>
            {data.industryStats.map((ind) => (
              <div key={ind.name} style={{ display: "grid", gridTemplateColumns: "1fr 40px 50px 50px", gap: 4, padding: "7px 0", borderBottom: "1px solid var(--surface)", alignItems: "center" }}>
                <div className="flex items-center gap-6"><div style={{ width: 7, height: 7, borderRadius: 2, background: ind.color, flexShrink: 0 }} /><span style={{ fontSize: 14, color: "var(--text-sec)" }}>{ind.name}</span></div>
                <div className="mono" style={{ fontSize: 14, color: "var(--text-muted)" }}>{ind.total}</div>
                <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: ind.replyRate > 30 ? "#34d399" : ind.replyRate > 15 ? "#fbbf24" : "#f87171" }}>{ind.replyRate}%</div>
                <div className="mono" style={{ fontSize: 14, color: "#a78bfa" }}>{ind.meetings}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Touchpoint distribution */}
      <div className="card">
        <div className="card-title">Touchpoints Distribution — How Many Touches Before Outcome</div>
        <div className="touch-dist-grid">
          {data.buckets.map((b) => (
            <div key={b.label} className="touch-dist-card">
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
    </div>
  );
}
