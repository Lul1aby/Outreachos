import { useState, useMemo, useCallback } from "react";
import { useStore } from "../store";
import { STATUSES, STATUS_COLORS, CHANNELS, CHANNEL_ICONS, CHANNEL_OUTCOMES } from "../constants";
import { todayStr, normalizeLinkedIn } from "../utils";
import { Modal, Badge, TpBadge, StatusPill, Select, Textarea, Input, CalendarPicker } from "./ui";

/* Render Claude's markdown-style brief into readable JSX */
function RenderBrief({ text }) {
  const lines = text.split("\n");
  return (
    <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text-sec)" }}>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} style={{ height: 6 }} />;
        // **Section Header** on its own line
        if (/^\*\*[^*]+\*\*$/.test(trimmed)) {
          return <div key={i} style={{ fontWeight: 700, color: "var(--text)", marginTop: 14, marginBottom: 4, fontSize: 14 }}>{trimmed.replace(/\*\*/g, "")}</div>;
        }
        // Bullet points
        if (/^[-•*]\s/.test(trimmed)) {
          const content = trimmed.replace(/^[-•*]\s/, "").replace(/\*\*(.+?)\*\*/g, "BOLD_START$1BOLD_END");
          const parts = content.split(/(BOLD_START|BOLD_END)/);
          let bold = false;
          return (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 3 }}>
              <span style={{ color: "var(--primary-light)", flexShrink: 0, marginTop: 2 }}>›</span>
              <span>{parts.map((p, j) => { if (p === "BOLD_START") { bold = true; return null; } if (p === "BOLD_END") { bold = false; return null; } return bold ? <strong key={j} style={{ color: "var(--text)" }}>{p}</strong> : p; })}</span>
            </div>
          );
        }
        // Regular line with possible inline bold
        const content = trimmed.replace(/\*\*(.+?)\*\*/g, "BOLD_START$1BOLD_END");
        const parts = content.split(/(BOLD_START|BOLD_END)/);
        let bold = false;
        return (
          <div key={i} style={{ marginBottom: 3 }}>
            {parts.map((p, j) => { if (p === "BOLD_START") { bold = true; return null; } if (p === "BOLD_END") { bold = false; return null; } return bold ? <strong key={j} style={{ color: "var(--text)" }}>{p}</strong> : p; })}
          </div>
        );
      })}
    </div>
  );
}

export default function ProspectDetail({ prospectId, onClose, onLogTouchpoint }) {
  const { state, dispatch } = useStore();
  const prospect = state.prospects.find((p) => p.id === prospectId);
  const [tab, setTab] = useState("touchpoints");
  const [research, setResearch] = useState(null);   // { brief, fetchedAt }
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState(null);
  const [hiring, setHiring] = useState(null);        // { brief, fetchedAt }
  const [hiringLoading, setHiringLoading] = useState(false);
  const [hiringError, setHiringError] = useState(null);

  /* Inline touchpoint form state */
  const [tpForm, setTpForm] = useState({ channel: "Call", date: todayStr(), note: "", status: CHANNEL_OUTCOMES["Call"][0] });
  const [copied, setCopied] = useState(null);

  /* Meeting scheduler state */
  const [meetDate, setMeetDate] = useState(todayStr());
  const [meetTime, setMeetTime] = useState("10:00");
  const [meetDuration, setMeetDuration] = useState("60");


  const copyContact = useCallback((text, field) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    });
  }, []);

  /* Inline reminder-style form (we use the touchpoint form here) */
  const touchpoints = prospect?.touchpoints || [];

  const fetchResearch = useCallback(async () => {
    if (!prospect) return;
    setResearching(true);
    setResearchError(null);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: prospect.name, company: prospect.company, title: prospect.title, industry: prospect.industry }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Research failed");
      setResearch({ brief: data.brief, fetchedAt: new Date().toLocaleTimeString() });
    } catch (err) {
      setResearchError(err.message);
    } finally {
      setResearching(false);
    }
  }, [prospect]);

  const fetchHiring = useCallback(async () => {
    if (!prospect) return;
    setHiringLoading(true);
    setHiringError(null);
    try {
      const res = await fetch("/api/hiring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: prospect.company, industry: prospect.industry }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Hiring lookup failed");
      setHiring({ brief: data.brief, fetchedAt: new Date().toLocaleTimeString() });
    } catch (err) {
      setHiringError(err.message);
    } finally {
      setHiringLoading(false);
    }
  }, [prospect]);

  const logInline = useCallback(() => {
    const tp = { channel: tpForm.channel, date: tpForm.date, note: tpForm.note.trim(), status: tpForm.status };
    dispatch({ type: "ADD_TOUCHPOINT", payload: { prospectId, touchpoint: tp, newStatus: tpForm.status } });
    setTpForm({ channel: "Call", date: todayStr(), note: "", status: CHANNEL_OUTCOMES["Call"][0] });

  }, [tpForm, prospectId, dispatch]);

  if (!prospect) return null;

  return (
    <Modal onClose={onClose} wide>
      {/* Header */}
      <div className="modal-header">
        <div>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" }}>{prospect.name}</div>
          <div style={{ fontSize: 14, color: "var(--text-sec)", marginTop: 4 }}>
            {prospect.title} at <span style={{ color: "var(--text)", fontWeight: 500 }}>{prospect.company}</span>
          </div>
        </div>
        <div className="flex gap-8 items-center">
          <Badge status={prospect.status} />
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
      </div>

      {/* Contact info */}
      <div className="detail-info">
        {prospect.email && (
          <div className="detail-info-item" style={{ cursor: "pointer" }} title="Click to copy" onClick={() => copyContact(prospect.email, "email")}>
            ✉️ {prospect.email}
            {copied === "email" && <span style={{ fontSize: 12, color: "var(--success)", marginLeft: 8 }}>Copied!</span>}
          </div>
        )}
        {prospect.phone && (
          <div className="detail-info-item" style={{ cursor: "pointer" }} title="Click to copy" onClick={() => copyContact(prospect.phone, "phone")}>
            📞 {prospect.phone}
            {copied === "phone" && <span style={{ fontSize: 12, color: "var(--success)", marginLeft: 8 }}>Copied!</span>}
          </div>
        )}
        {prospect.linkedin && (
          <div className="detail-info-item">
            💼 <a href={normalizeLinkedIn(prospect.linkedin)} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary-light)", textDecoration: "none" }}>{prospect.linkedin}</a>
          </div>
        )}
        <div className="detail-info-item">🏭 {prospect.industry}</div>
        {prospect.listName && <div className="detail-info-item">📋 {prospect.listName}</div>}
        <div className="detail-info-item" style={{ color: "var(--text-muted)" }}>📅 Added {prospect.createdAt}</div>
      </div>

      {/* Notes */}
      {prospect.notes && (
        <div className="detail-notes">
          <span className="detail-section-label" style={{ display: "block", marginBottom: 4 }}>Notes</span>
          {prospect.notes}
        </div>
      )}

      {/* Status update */}
      <div className="mb-20">
        <div className="detail-section-label" style={{ marginBottom: 6 }}>Update Status</div>
        <div className="detail-status-row">
          {STATUSES.map((s) => (
            <StatusPill key={s} status={s} active={prospect.status === s}
              onClick={() => dispatch({ type: "UPDATE_PROSPECT", payload: { id: prospect.id, updates: { status: s } } })} />
          ))}
        </div>
      </div>

      {/* Google Calendar scheduler — shown when Meeting Booked */}
      {prospect.status === "Meeting Booked" && (
        <div style={{ background: "var(--surface)", border: "1px solid #2d4a2d", borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#4ade80", marginBottom: 12, letterSpacing: "0.02em", textTransform: "uppercase" }}>
            📅 Schedule Meeting
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Date</div>
              <CalendarPicker value={meetDate} onChange={setMeetDate} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Time</div>
              <input
                type="time"
                className="form-input"
                value={meetTime}
                onChange={(e) => setMeetTime(e.target.value)}
                style={{ width: 120 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Duration</div>
              <select
                className="form-select"
                value={meetDuration}
                onChange={(e) => setMeetDuration(e.target.value)}
                style={{ width: 110 }}
              >
                <option value="15">15 min</option>
                <option value="30">30 min</option>
                <option value="45">45 min</option>
                <option value="60">60 min</option>
                <option value="90">90 min</option>
              </select>
            </div>
            <button
              className="btn btn-primary btn-sm"
              style={{ background: "#1a7f4e", border: "1px solid #2d9c64" }}
              onClick={() => {
                const [y, m, d] = meetDate.split("-");
                const [hh, mm] = meetTime.split(":");
                const start = new Date(+y, +m - 1, +d, +hh, +mm);
                const end = new Date(start.getTime() + +meetDuration * 60000);
                const fmt = (dt) => dt.getFullYear().toString()
                  + String(dt.getMonth() + 1).padStart(2, "0")
                  + String(dt.getDate()).padStart(2, "0")
                  + "T" + String(dt.getHours()).padStart(2, "0")
                  + String(dt.getMinutes()).padStart(2, "0") + "00";
                const title = encodeURIComponent(`Meeting with ${prospect.name} (${prospect.company})`);
                const dates = `${fmt(start)}/${fmt(end)}`;
                const add = prospect.email ? `&add=${encodeURIComponent(prospect.email)}` : "";
                const details = encodeURIComponent(`Prospect: ${prospect.name}\nCompany: ${prospect.company}${prospect.title ? `\nTitle: ${prospect.title}` : ""}${prospect.phone ? `\nPhone: ${prospect.phone}` : ""}`);
                window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}${add}`, "_blank");
              }}
            >
              Open Google Calendar →
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tab-switcher" style={{ maxWidth: 480 }}>
        <button className={`tab-switch${tab === "touchpoints" ? " active" : ""}`} onClick={() => setTab("touchpoints")}>
          Touchpoints ({touchpoints.length})
        </button>
        <button className={`tab-switch${tab === "log" ? " active" : ""}`} onClick={() => setTab("log")}>
          + Log New
        </button>
        <button className={`tab-switch${tab === "research" ? " active" : ""}`} onClick={() => setTab("research")} style={{ color: tab === "research" ? undefined : "var(--primary-light)" }}>
          🔍 Research
        </button>
      </div>

      {/* Touchpoints tab */}
      {tab === "touchpoints" && (
        <>
          {touchpoints.length === 0 && <div style={{ color: "var(--text-dim)", textAlign: "center", padding: "20px 0" }}>No touchpoints yet. Log your first outreach.</div>}
          {[...touchpoints].reverse().map((tp) => (
            <div key={tp.id} className="tp-row">
              <span className="tp-icon">{CHANNEL_ICONS[tp.channel]}</span>
              <div className="tp-content">
                <div className="tp-meta">
                  <span className="tp-channel">{tp.channel}</span>
                  <Badge status={tp.status} />
                  <span className="tp-date">{tp.date}</span>
                </div>
                <div className="tp-note">{tp.note}</div>
              </div>
              <button className="btn btn-danger btn-sm btn-icon" title="Delete"
                onClick={() => dispatch({ type: "DELETE_TOUCHPOINT", payload: { prospectId: prospect.id, touchpointId: tp.id } })}>×</button>
            </div>
          ))}
        </>
      )}

      {/* Log new tab */}
      {tab === "log" && (
        <div className="inline-form">
          <div className="inline-form-title">Log a touchpoint</div>
          <div className="inline-row">
            <select className="form-select" value={tpForm.channel} onChange={(e) => {
              const channel = e.target.value;
              setTpForm((f) => ({ ...f, channel, status: CHANNEL_OUTCOMES[channel][0] }));
            }}>
              {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_ICONS[c]} {c}</option>)}
            </select>
            <CalendarPicker value={tpForm.date} onChange={(d) => setTpForm((f) => ({ ...f, date: d }))} />
          </div>
          <div className="inline-row">
            <select className="form-select" value={tpForm.status} onChange={(e) => setTpForm((f) => ({ ...f, status: e.target.value }))}>
              {CHANNEL_OUTCOMES[tpForm.channel].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="inline-row">
            <textarea className="form-textarea" rows={3} value={tpForm.note} placeholder="What happened? Key takeaways, next steps…" onChange={(e) => setTpForm((f) => ({ ...f, note: e.target.value }))} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={logInline}>Log Touchpoint</button>

          {/* Google Calendar shortcut when logging a Meeting Booked */}
          {tpForm.status === "Meeting Booked" && (
            <div style={{ background: "var(--bg)", border: "1px solid #2d4a2d", borderRadius: 10, padding: "14px 16px", marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#4ade80", marginBottom: 12, letterSpacing: "0.02em", textTransform: "uppercase" }}>
                📅 Schedule Meeting
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Date</div>
                  <CalendarPicker value={meetDate} onChange={setMeetDate} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Time</div>
                  <input type="time" className="form-input" value={meetTime} onChange={(e) => setMeetTime(e.target.value)} style={{ width: 120 }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Duration</div>
                  <select className="form-select" value={meetDuration} onChange={(e) => setMeetDuration(e.target.value)} style={{ width: 110 }}>
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">60 min</option>
                    <option value="90">90 min</option>
                  </select>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ background: "#1a7f4e", border: "1px solid #2d9c64" }}
                  onClick={() => {
                    const [y, m, d] = meetDate.split("-");
                    const [hh, mm] = meetTime.split(":");
                    const start = new Date(+y, +m - 1, +d, +hh, +mm);
                    const end = new Date(start.getTime() + +meetDuration * 60000);
                    const fmt = (dt) => dt.getFullYear().toString()
                      + String(dt.getMonth() + 1).padStart(2, "0")
                      + String(dt.getDate()).padStart(2, "0")
                      + "T" + String(dt.getHours()).padStart(2, "0")
                      + String(dt.getMinutes()).padStart(2, "0") + "00";
                    const title = encodeURIComponent(`Meeting with ${prospect.name} (${prospect.company})`);
                    const dates = `${fmt(start)}/${fmt(end)}`;
                    const add = prospect.email ? `&add=${encodeURIComponent(prospect.email)}` : "";
                    const details = encodeURIComponent(`Prospect: ${prospect.name}\nCompany: ${prospect.company}${prospect.title ? `\nTitle: ${prospect.title}` : ""}${prospect.phone ? `\nPhone: ${prospect.phone}` : ""}`);
                    window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}${add}`, "_blank");
                  }}
                >
                  Open Google Calendar →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Research tab */}
      {tab === "research" && (
        <div style={{ padding: "8px 0" }}>
          {!research && !researching && !researchError && (
            <div style={{ textAlign: "center", padding: "28px 16px" }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>🔍</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>AI Company Research</div>
              <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 20, maxWidth: 340, margin: "0 auto 20px" }}>
                Claude will search the web for recent news, funding, pain points, and suggest cold call hooks for <strong style={{ color: "var(--text)" }}>{prospect.company}</strong>.
              </div>
              <button className="btn btn-primary" onClick={fetchResearch}>
                Research {prospect.company} →
              </button>
            </div>
          )}

          {researching && (
            <div style={{ textAlign: "center", padding: "32px 16px" }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>⏳</div>
              <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 6 }}>Searching the web…</div>
              <div className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>Researching {prospect.company} · This takes 10–20 seconds</div>
            </div>
          )}

          {researchError && (
            <div style={{ padding: "16px", background: "#2a1e1e", border: "1px solid #991b1b", borderRadius: 8, marginBottom: 12 }}>
              <div style={{ color: "#f87171", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Research failed</div>
              <div style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 12 }}>{researchError}</div>
              <button className="btn btn-ghost btn-sm" onClick={fetchResearch}>Try Again</button>
            </div>
          )}

          {research && (
            <div>
              <div className="flex items-center justify-between mb-12">
                <div className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  Researched at {research.fetchedAt} · Powered by Claude + web search
                </div>
                <div className="flex gap-8">
                  <button className="btn btn-ghost btn-sm" onClick={fetchResearch} title="Refresh research">↻ Refresh</button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      const note = `--- Research Brief (${new Date().toLocaleDateString()}) ---\n${research.brief}`;
                      dispatch({ type: "UPDATE_PROSPECT", payload: { id: prospect.id, updates: { notes: prospect.notes ? prospect.notes + "\n\n" + note : note } } });
                    }}
                    title="Save brief to prospect notes"
                  >
                    Save to Notes
                  </button>
                </div>
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 18px" }}>
                <RenderBrief text={research.brief} />
              </div>
            </div>
          )}

          {/* Hiring section */}
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12, letterSpacing: "0.02em", textTransform: "uppercase" }}>
              Open Roles
            </div>

            {!hiring && !hiringLoading && !hiringError && (
              <div style={{ textAlign: "center", padding: "20px 16px" }}>
                <div style={{ fontSize: 22, marginBottom: 8 }}>💼</div>
                <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 16, maxWidth: 320, margin: "0 auto 16px" }}>
                  Find what <strong style={{ color: "var(--text)" }}>{prospect.company}</strong> is actively hiring for — use it as a sales angle.
                </div>
                <button className="btn btn-outline btn-sm" onClick={fetchHiring}>
                  Find Open Roles →
                </button>
              </div>
            )}

            {hiringLoading && (
              <div style={{ textAlign: "center", padding: "24px 16px" }}>
                <div style={{ fontSize: 20, marginBottom: 10 }}>⏳</div>
                <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 4 }}>Scanning job boards…</div>
                <div className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>Checking careers page · LinkedIn Jobs · Indeed</div>
              </div>
            )}

            {hiringError && (
              <div style={{ padding: "14px", background: "#2a1e1e", border: "1px solid #991b1b", borderRadius: 8 }}>
                <div style={{ color: "#f87171", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Lookup failed</div>
                <div style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 10 }}>{hiringError}</div>
                <button className="btn btn-ghost btn-sm" onClick={fetchHiring}>Try Again</button>
              </div>
            )}

            {hiring && (
              <div>
                <div className="flex items-center justify-between mb-12">
                  <div className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>
                    Fetched at {hiring.fetchedAt} · Powered by Claude + web search
                  </div>
                  <div className="flex gap-8">
                    <button className="btn btn-ghost btn-sm" onClick={fetchHiring} title="Refresh hiring data">↻ Refresh</button>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        const note = `--- Open Roles at ${prospect.company} (${new Date().toLocaleDateString()}) ---\n${hiring.brief}`;
                        dispatch({ type: "UPDATE_PROSPECT", payload: { id: prospect.id, updates: { notes: prospect.notes ? prospect.notes + "\n\n" + note : note } } });
                      }}
                      title="Save hiring brief to prospect notes"
                    >
                      Save to Notes
                    </button>
                  </div>
                </div>
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 18px" }}>
                  <RenderBrief text={hiring.brief} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete */}
      <div className="pt-12 mt-16 border-t">
        <button className="btn btn-danger" onClick={() => { dispatch({ type: "DELETE_PROSPECT", payload: prospect.id }); onClose(); }}>
          Delete Prospect
        </button>
      </div>
    </Modal>
  );
}
