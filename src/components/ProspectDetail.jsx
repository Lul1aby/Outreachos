import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useStore } from "../store";
import { supabase } from "../supabase";
import { STATUSES, STATUS_COLORS, CHANNELS, CHANNEL_ICONS, CHANNEL_OUTCOMES, INDUSTRIES } from "../constants";
import { todayStr, nowTimeStr, normalizeLinkedIn } from "../utils";
import { Modal, Badge, StatusPill, Input, CalendarPicker } from "./ui";

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
  const { state, dispatch, tasksToday } = useStore();
  const prospect = state.prospects.find((p) => p.id === prospectId);

  /* Pending tasks for this prospect */
  const pendingTasks = useMemo(() => tasksToday.filter((t) => t.prospect.id === prospectId), [tasksToday, prospectId]);
  const [tab, setTab] = useState("touchpoints");
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState(null);
  const [hiring, setHiring] = useState(null);        // { brief, fetchedAt }
  const [hiringLoading, setHiringLoading] = useState(false);
  const [hiringError, setHiringError] = useState(null);

  /* Gmail integration state */
  const [gmailStatus, setGmailStatus] = useState(null); // { connected, email }
  const [gmailLoading, setGmailLoading] = useState(false);
  const [emailForm, setEmailForm] = useState({ subject: "", body: "" });
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null); // { success, error }
  const [syncing_, setSyncing_] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  /* Enrichment state */
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState(null);

  /* Cross-user duplicate check — only fires for non-original-owner */
  const [dupeInfo, setDupeInfo] = useState(null); // { field, matchedName, matchedCompany, ownerEmail }
  useEffect(() => {
    if (!prospect || !supabase) return;
    let cancelled = false;
    (async () => {
      try {
        const session = await supabase.auth.getSession();
        const token = session?.data?.session?.access_token;
        const res = await fetch("/api/check-duplicates", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ prospects: [{ email: prospect.email, phone: prospect.phone, linkedin: prospect.linkedin, name: prospect.name, company: prospect.company }] }),
        });
        if (res.ok && !cancelled) {
          const body = await res.json();
          const match = (body.matches || [])[0];
          if (match) {
            setDupeInfo({ field: match.field, matchedName: match.matchedName, matchedCompany: match.matchedCompany, ownerEmail: match.ownerEmail });
          }
        }
      } catch { /* fail silently */ }
    })();
    return () => { cancelled = true; };
  }, [prospect?.id]);

  /* Inline touchpoint form state */
  const [tpForm, setTpForm] = useState({ channel: "Call", date: todayStr(), note: "", status: CHANNEL_OUTCOMES["Call"][0] });
  const [copied, setCopied] = useState(null);
  const [editingTp, setEditingTp] = useState(null); // touchpoint id being edited
  const [editForm, setEditForm] = useState(null);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const statusPickerRef = useRef(null);
  const [showPendingTasks, setShowPendingTasks] = useState(false);
  const [editingField, setEditingField] = useState(null); // which field is being edited
  const [editFieldValue, setEditFieldValue] = useState("");

  const saveField = useCallback((field) => {
    const trimmed = editFieldValue.trim();
    if (trimmed && trimmed !== prospect[field]) {
      dispatch({ type: "UPDATE_PROSPECT", payload: { id: prospectId, updates: { [field]: trimmed } } });
    }
    setEditingField(null);
    setEditFieldValue("");
  }, [editFieldValue, prospect, prospectId, dispatch]);

  const startEditing = useCallback((field) => {
    setEditingField(field);
    setEditFieldValue(prospect[field] || "");
  }, [prospect]);

  // Close status picker on outside click
  useEffect(() => {
    if (!showStatusPicker) return;
    const close = (e) => {
      if (statusPickerRef.current && !statusPickerRef.current.contains(e.target)) setShowStatusPicker(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showStatusPicker]);

  /* Meeting scheduler state */
  const [meetDate, setMeetDate] = useState(todayStr());
  const [meetTime, setMeetTime] = useState("10:00");
  const [meetDuration, setMeetDuration] = useState("60");


  const copyContact = useCallback((text, field) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => {});
  }, []);

  /* Inline reminder-style form (we use the touchpoint form here) */
  const touchpoints = prospect?.touchpoints || [];

  const research = prospect?.research || null; // { brief, fetchedAt }

  const fetchResearch = useCallback(async () => {
    if (!prospect) return;
    setResearching(true);
    setResearchError(null);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: prospect.company, industry: prospect.industry }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Research failed");
      dispatch({ type: "UPDATE_PROSPECT", payload: { id: prospect.id, updates: { research: { brief: data.brief, fetchedAt: new Date().toLocaleTimeString() } } } });
    } catch (err) {
      setResearchError(err.message);
    } finally {
      setResearching(false);
    }
  }, [prospect, dispatch]);

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

  /* ── Gmail: check connection status on mount ── */
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      try {
        const session = await supabase.auth.getSession();
        const token = session?.data?.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/gmail-auth", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: "status" }),
        });
        if (res.ok && !cancelled) setGmailStatus(await res.json());
      } catch { /* fail silently */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const connectGmail = useCallback(async () => {
    if (!supabase) return;
    setGmailLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session?.data?.session?.access_token;
      const redirectUri = `${window.location.origin}/api/gmail-callback`;
      // The redirect URI must match what's configured in Google Cloud Console

      // We'll use a popup-less flow: redirect in the same window, handle code on return
      // For simplicity, open in a new window and poll
      const res = await fetch("/api/gmail-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "get-auth-url", redirectUri }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Open auth URL — user will be redirected back with ?code= parameter
      const popup = window.open(data.url, "gmail-auth", "width=500,height=600");

      // Poll for the popup to close (user completed auth)
      const poll = setInterval(async () => {
        try {
          if (!popup || popup.closed) {
            clearInterval(poll);
            // Re-check status
            const statusRes = await fetch("/api/gmail-auth", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ action: "status" }),
            });
            if (statusRes.ok) setGmailStatus(await statusRes.json());
            setGmailLoading(false);
          }
        } catch {
          clearInterval(poll);
          setGmailLoading(false);
        }
      }, 1000);
    } catch (err) {
      setGmailLoading(false);
    }
  }, []);

  const disconnectGmail = useCallback(async () => {
    if (!supabase) return;
    try {
      const session = await supabase.auth.getSession();
      const token = session?.data?.session?.access_token;
      await fetch("/api/gmail-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "disconnect" }),
      });
      setGmailStatus({ connected: false, email: null });
    } catch { /* ignore */ }
  }, []);

  const sendEmail = useCallback(async () => {
    if (!prospect?.email || !emailForm.subject.trim() || !emailForm.body.trim()) return;
    setSending(true);
    setSendResult(null);
    try {
      const session = await supabase.auth.getSession();
      const token = session?.data?.session?.access_token;
      const res = await fetch("/api/gmail-send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to: prospect.email,
          subject: emailForm.subject.trim(),
          body: emailForm.body.trim().replace(/\n/g, "<br>"),
          prospectId: prospect.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Auto-log as touchpoint
      dispatch({
        type: "ADD_TOUCHPOINT",
        payload: {
          prospectId: prospect.id,
          touchpoint: {
            channel: "Email",
            date: todayStr(),
            time: nowTimeStr(),
            note: `[Gmail] Subject: ${emailForm.subject.trim()}`,
            status: "Sent",
          },
          newStatus: "Sent",
        },
      });

      setSendResult({ success: true });
      setEmailForm({ subject: "", body: "" });
      // Switch to touchpoints tab after a moment
      setTimeout(() => setTab("touchpoints"), 1500);
    } catch (err) {
      setSendResult({ error: err.message });
    } finally {
      setSending(false);
    }
  }, [prospect, emailForm, dispatch]);

  const syncGmailReplies = useCallback(async () => {
    if (!prospect?.email || !supabase) return;
    setSyncing_(true);
    setSyncResult(null);
    try {
      const session = await supabase.auth.getSession();
      const token = session?.data?.session?.access_token;
      const res = await fetch("/api/gmail-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          prospectEmails: [{ email: prospect.email, prospectId: prospect.id }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const reply = data.updates?.find((u) => u.prospectId === prospect.id);
      const sent = data.sentUpdates?.find((u) => u.prospectId === prospect.id);

      if (reply && reply.replyCount > 0) {
        // Check if we already have a "Replied" touchpoint from this prospect
        const hasReply = prospect.touchpoints.some((t) => t.channel === "Email" && t.status === "Replied");
        if (!hasReply) {
          dispatch({
            type: "ADD_TOUCHPOINT",
            payload: {
              prospectId: prospect.id,
              touchpoint: {
                channel: "Email",
                date: todayStr(),
                time: nowTimeStr(),
                note: `[Gmail Sync] Reply detected: "${reply.snippet?.slice(0, 100)}..."`,
                status: "Replied",
              },
              newStatus: "Replied",
            },
          });
        }
        setSyncResult({ replies: reply.replyCount, sent: sent?.sentCount || 0 });
      } else {
        setSyncResult({ replies: 0, sent: sent?.sentCount || 0 });
      }
    } catch (err) {
      setSyncResult({ error: err.message });
    } finally {
      setSyncing_(false);
    }
  }, [prospect, dispatch]);

  const enrichProspect = useCallback(async () => {
    if (!prospect) return;
    setEnriching(true);
    setEnrichError(null);
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: prospect.name,
          company: prospect.company,
          title: prospect.title,
          industry: prospect.industry,
          email: prospect.email,
          linkedin: prospect.linkedin,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Apply enriched fields to prospect (only non-empty fields the prospect doesn't already have)
      const updates = {};
      const enriched = data.enriched || {};
      if (enriched.title && !prospect.title) updates.title = enriched.title;
      if (enriched.email && !prospect.email) updates.email = enriched.email;
      if (enriched.phone && !prospect.phone) updates.phone = enriched.phone;
      if (enriched.linkedin && !prospect.linkedin) updates.linkedin = enriched.linkedin;

      // Store full enrichment data
      updates.enrichment = {
        ...enriched,
        enrichedAt: new Date().toISOString(),
      };

      dispatch({ type: "UPDATE_PROSPECT", payload: { id: prospect.id, updates } });
    } catch (err) {
      setEnrichError(err.message);
    } finally {
      setEnriching(false);
    }
  }, [prospect, dispatch]);

  const logInline = useCallback(() => {
    const tp = { channel: tpForm.channel, date: tpForm.date, time: nowTimeStr(), note: tpForm.note.trim(), status: tpForm.status };
    dispatch({ type: "ADD_TOUCHPOINT", payload: { prospectId, touchpoint: tp, newStatus: tpForm.status } });
    setTpForm({ channel: "Call", date: todayStr(), note: "", status: CHANNEL_OUTCOMES["Call"][0] });
    // Reset meeting scheduler so next open shows fresh date/time
    setMeetDate(todayStr());
    setMeetTime("10:00");
    // Switch back to touchpoints tab to show the logged entry
    setTab("touchpoints");
  }, [tpForm, prospectId, dispatch]);

  if (!prospect) return null;

  return (
    <Modal onClose={onClose} wide>
      {/* Header */}
      <div className="modal-header">
        <div>
          {editingField === "name" ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                className="form-input"
                autoFocus
                value={editFieldValue}
                onChange={(e) => setEditFieldValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveField("name"); if (e.key === "Escape") setEditingField(null); }}
                onBlur={() => saveField("name")}
                style={{ fontSize: 18, fontWeight: 700, marginBottom: 0, padding: "4px 8px", width: 260 }}
              />
            </div>
          ) : (
            <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }} onClick={() => startEditing("name")} title="Click to edit name">
              {prospect.name}
              <span style={{ fontSize: 13, color: "var(--text-dim)", opacity: 0.5 }}>✏️</span>
            </div>
          )}
          <div style={{ fontSize: 14, color: "var(--text-sec)", marginTop: 4, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            {editingField === "title" ? (
              <input
                className="form-input"
                autoFocus
                value={editFieldValue}
                onChange={(e) => setEditFieldValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveField("title"); if (e.key === "Escape") setEditingField(null); }}
                onBlur={() => saveField("title")}
                style={{ fontSize: 14, marginBottom: 0, padding: "2px 6px", width: 160 }}
              />
            ) : (
              <span style={{ cursor: "pointer" }} onClick={() => startEditing("title")} title="Click to edit title">
                {prospect.title || "No title"}
                <span style={{ fontSize: 11, color: "var(--text-dim)", opacity: 0.5, marginLeft: 4 }}>✏️</span>
              </span>
            )}
            {" at "}
            {editingField === "company" ? (
              <input
                className="form-input"
                autoFocus
                value={editFieldValue}
                onChange={(e) => setEditFieldValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveField("company"); if (e.key === "Escape") setEditingField(null); }}
                onBlur={() => saveField("company")}
                style={{ fontSize: 14, fontWeight: 500, marginBottom: 0, padding: "2px 6px", width: 180 }}
              />
            ) : (
              <span style={{ color: "var(--text)", fontWeight: 500, cursor: "pointer" }} onClick={() => startEditing("company")} title="Click to edit company">
                {prospect.company}
                <span style={{ fontSize: 11, color: "var(--text-dim)", opacity: 0.5, marginLeft: 4 }}>✏️</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-8 items-center">
          <div ref={statusPickerRef} style={{ position: "relative" }}>
            <button
              onClick={() => setShowStatusPicker((v) => !v)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
              title="Click to change status"
            >
              <Badge status={prospect.status} />
            </button>
            {showStatusPicker && (
              <div style={{
                position: "absolute", top: "100%", right: 0, marginTop: 6, zIndex: 100,
                background: "var(--card-bg, var(--surface))", border: "1px solid var(--border)", borderRadius: 10,
                boxShadow: "0 8px 24px rgba(0,0,0,0.3)", padding: "6px 0", minWidth: 180,
              }}>
                {STATUSES.map((s) => {
                  const c = STATUS_COLORS[s];
                  const isActive = prospect.status === s;
                  return (
                    <button
                      key={s}
                      onClick={() => {
                        dispatch({ type: "UPDATE_PROSPECT", payload: { id: prospectId, updates: { status: s } } });
                        setShowStatusPicker(false);
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%",
                        padding: "7px 14px", background: isActive ? (c.bg || "var(--primary-bg)") : "transparent",
                        border: "none", cursor: "pointer", fontSize: 14, color: isActive ? c.text : "var(--text-sec)",
                        fontFamily: "var(--font)", textAlign: "left",
                      }}
                      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--surface)"; }}
                      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.text, flexShrink: 0 }} />
                      {s}
                      {isActive && <span style={{ marginLeft: "auto", fontSize: 12 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
      </div>

      {/* Contact info */}
      <div className="detail-info">
        <div className="detail-info-item" style={{ cursor: "pointer" }}>
          {editingField === "email" ? (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              ✉️
              <input
                className="form-input"
                autoFocus
                value={editFieldValue}
                onChange={(e) => setEditFieldValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveField("email"); if (e.key === "Escape") setEditingField(null); }}
                onBlur={() => saveField("email")}
                placeholder="email@example.com"
                style={{ fontSize: 13, marginBottom: 0, padding: "2px 6px", width: 200 }}
              />
            </span>
          ) : (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span title="Click to copy" onClick={() => prospect.email && copyContact(prospect.email, "email")}>
                ✉️ {prospect.email || <span style={{ color: "var(--text-dim)" }}>No email</span>}
                {copied === "email" && <span style={{ fontSize: 12, color: "var(--success)", marginLeft: 8 }}>Copied!</span>}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-dim)", opacity: 0.5, cursor: "pointer" }} onClick={() => startEditing("email")} title="Edit email">✏️</span>
            </span>
          )}
        </div>
        <div className="detail-info-item" style={{ cursor: "pointer" }}>
          {editingField === "phone" ? (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              📞
              <input
                className="form-input"
                autoFocus
                value={editFieldValue}
                onChange={(e) => setEditFieldValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveField("phone"); if (e.key === "Escape") setEditingField(null); }}
                onBlur={() => saveField("phone")}
                placeholder="+1 234 567 8900"
                style={{ fontSize: 13, marginBottom: 0, padding: "2px 6px", width: 180 }}
              />
            </span>
          ) : (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span title="Click to copy" onClick={() => prospect.phone && copyContact(prospect.phone, "phone")}>
                📞 {prospect.phone || <span style={{ color: "var(--text-dim)" }}>No phone</span>}
                {copied === "phone" && <span style={{ fontSize: 12, color: "var(--success)", marginLeft: 8 }}>Copied!</span>}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-dim)", opacity: 0.5, cursor: "pointer" }} onClick={() => startEditing("phone")} title="Edit phone">✏️</span>
            </span>
          )}
        </div>
        <div className="detail-info-item">
          {editingField === "linkedin" ? (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              💼
              <input
                className="form-input"
                autoFocus
                value={editFieldValue}
                onChange={(e) => setEditFieldValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveField("linkedin"); if (e.key === "Escape") setEditingField(null); }}
                onBlur={() => saveField("linkedin")}
                placeholder="linkedin.com/in/username"
                style={{ fontSize: 13, marginBottom: 0, padding: "2px 6px", width: 240 }}
              />
            </span>
          ) : (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {prospect.linkedin ? (
                <span>💼 <a href={normalizeLinkedIn(prospect.linkedin)} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary-light)", textDecoration: "none" }}>{prospect.linkedin}</a></span>
              ) : (
                <span>💼 <span style={{ color: "var(--text-dim)" }}>No LinkedIn</span></span>
              )}
              <span style={{ fontSize: 11, color: "var(--text-dim)", opacity: 0.5, cursor: "pointer" }} onClick={() => startEditing("linkedin")} title="Edit LinkedIn">✏️</span>
            </span>
          )}
        </div>
        <div className="detail-info-item">
          {editingField === "industry" ? (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              🏭
              <select
                className="form-select"
                autoFocus
                value={editFieldValue}
                onChange={(e) => { setEditFieldValue(e.target.value); }}
                onBlur={() => saveField("industry")}
                style={{ fontSize: 13, marginBottom: 0, padding: "2px 6px", width: "auto" }}
              >
                {INDUSTRIES.map((ind) => <option key={ind} value={ind}>{ind}</option>)}
              </select>
              <button className="btn btn-primary btn-sm" style={{ padding: "2px 10px", fontSize: 12 }} onClick={() => saveField("industry")}>Save</button>
            </span>
          ) : (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              🏭 {prospect.industry}
              <span style={{ fontSize: 11, color: "var(--text-dim)", opacity: 0.5, cursor: "pointer" }} onClick={() => startEditing("industry")} title="Edit industry">✏️</span>
            </span>
          )}
        </div>
        {prospect.listName && <div className="detail-info-item">📋 {prospect.listName}</div>}
        <div className="detail-info-item" style={{ color: "var(--text-muted)" }}>📅 Added {prospect.createdAt}</div>
      </div>

      {/* Pending tasks — compact badge, click to expand */}
      {pendingTasks.length > 0 && (
        <div style={{ position: "relative", marginBottom: 12 }}>
          <button
            onClick={() => setShowPendingTasks((v) => !v)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "#052e16", border: "1px solid #166534", borderRadius: 8,
              padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600,
              color: "#4ade80", fontFamily: "var(--font)",
            }}
          >
            ⚡ {pendingTasks.length} Pending Task{pendingTasks.length > 1 ? "s" : ""}
            <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 2 }}>{showPendingTasks ? "▲" : "▼"}</span>
          </button>
          {showPendingTasks && (
            <div style={{
              background: "#052e16", border: "1px solid #166534", borderRadius: 10,
              padding: "8px", marginTop: 6, maxHeight: 180, overflowY: "auto",
            }}>
              {pendingTasks.map((task, idx) => {
                const stepIdx = task.seq.steps.findIndex((s) => s.id === task.step.id);
                return (
                  <div key={`${task.enrollmentId}-${task.step.id}`} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                    background: "#0a3d1f", borderRadius: 6, marginBottom: idx < pendingTasks.length - 1 ? 3 : 0,
                  }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{CHANNEL_ICONS[task.step.channel] || "📌"}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", flexShrink: 0 }}>{task.step.channel}</span>
                    <span style={{ fontSize: 11, color: "#86efac", fontFamily: "var(--mono)", flexShrink: 0, background: "#064e24", padding: "1px 5px", borderRadius: 4 }}>
                      {stepIdx + 1}/{task.seq.steps.length}
                    </span>
                    {task.step._swappedFromLinkedIn && <span style={{ fontSize: 11, color: "#fbbf24", background: "#422006", padding: "1px 5px", borderRadius: 4, flexShrink: 0 }}>💼 swapped</span>}
                    {task.step.note && <span style={{ fontSize: 12, color: "#6ee7b7", opacity: 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{task.step.note}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Duplicate warning — shown only when this prospect matches another user's record (i.e. current user is NOT the original owner) */}
      {dupeInfo && (
        <div style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--danger)", marginBottom: 4 }}>
            🚨 Duplicate prospect
          </div>
          <div style={{ fontSize: 13, color: "var(--danger)", opacity: 0.9 }}>
            This prospect already exists in <strong>{dupeInfo.ownerEmail}</strong>'s account — matches <strong>{dupeInfo.matchedName}</strong> at {dupeInfo.matchedCompany} by {dupeInfo.field}. Consider deleting to avoid duplicate outreach.
          </div>
        </div>
      )}

      {/* Notes */}
      {prospect.notes && (
        <div className="detail-notes">
          <span className="detail-section-label" style={{ display: "block", marginBottom: 4 }}>Notes</span>
          {prospect.notes}
        </div>
      )}

      {/* Google Calendar scheduler — shown when Meeting Booked */}
      {prospect.status === "Meeting Booked" && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--success-border)", borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--success-bright)", marginBottom: 12, letterSpacing: "0.02em", textTransform: "uppercase" }}>
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
              style={{ background: "var(--success-border)", border: "1px solid var(--success-bright)" }}
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
      <div className="tab-switcher" style={{ maxWidth: 640 }}>
        <button className={`tab-switch${tab === "touchpoints" ? " active" : ""}`} onClick={() => setTab("touchpoints")}>
          Touchpoints ({touchpoints.length})
        </button>
        <button className={`tab-switch${tab === "log" ? " active" : ""}`} onClick={() => setTab("log")}>
          + Log New
        </button>
        <button className={`tab-switch${tab === "email" ? " active" : ""}`} onClick={() => setTab("email")} style={{ color: tab === "email" ? undefined : "var(--info)" }}>
          ✉️ Email
        </button>
        <button className={`tab-switch${tab === "enrich" ? " active" : ""}`} onClick={() => setTab("enrich")} style={{ color: tab === "enrich" ? undefined : "var(--accent)" }}>
          ✨ Enrich
        </button>
        <button className={`tab-switch${tab === "research" ? " active" : ""}`} onClick={() => setTab("research")} style={{ color: tab === "research" ? undefined : "var(--primary-light)" }}>
          🔍 Research
        </button>
      </div>

      {/* Touchpoints tab */}
      {tab === "touchpoints" && (
        <>
          {touchpoints.length === 0 ? (
            <div style={{ color: "var(--text-dim)", textAlign: "center", padding: "28px 0" }}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>📭</div>
              No touchpoints yet — click a status above or use the Log New tab to record your first outreach.
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              {/* Channel activity summary */}
              {(() => {
                const emailCount = touchpoints.filter((t) => t.channel === "Email").length;
                const linkedInTps = touchpoints.filter((t) => t.channel === "LinkedIn");
                const connStatus = linkedInTps.find((t) => t.status === "Accepted") ? "Accepted" : linkedInTps.find((t) => t.status === "Pending" || t.status === "Connection Req Sent") ? "Pending" : null;
                if (!emailCount && !linkedInTps.length) return null;
                return (
                  <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                    {emailCount > 0 && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 12px" }}>
                        <span>✉️</span>
                        <span style={{ fontWeight: 700, color: "var(--primary-light)" }}>{emailCount}</span>
                        <span style={{ color: "var(--text-muted)" }}>{emailCount === 1 ? "email sent" : "emails sent"}</span>
                      </div>
                    )}
                    {connStatus && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, background: connStatus === "Accepted" ? "#052e16" : "#1c1917", border: `1px solid ${connStatus === "Accepted" ? "#166534" : "#92400e"}`, borderRadius: 8, padding: "5px 12px" }}>
                        <span>💼</span>
                        <span style={{ fontWeight: 700, color: connStatus === "Accepted" ? "#4ade80" : "#fbbf24" }}>LinkedIn: {connStatus}</span>
                      </div>
                    )}
                  </div>
                );
              })()}
              {/* Timeline line */}
              <div style={{ position: "absolute", left: 19, top: 8, bottom: 8, width: 2, background: "var(--border)", borderRadius: 2 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {[...touchpoints].sort((a, b) => b.date.localeCompare(a.date)).map((tp, idx, arr) => {
                  const prevTp = arr[idx + 1]; // older entry
                  const statusChanged = !prevTp || prevTp.status !== tp.status;
                  const isEditing = editingTp === tp.id;
                  return (
                    <div key={tp.id} style={{ display: "flex", gap: 14, paddingBottom: 16, position: "relative" }}>
                      {/* Dot */}
                      <div style={{ width: 40, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 3 }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: "50%", border: "2px solid var(--border)",
                          background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 13, position: "relative", zIndex: 1,
                          boxShadow: statusChanged ? "0 0 0 3px var(--primary-bg)" : undefined,
                        }}>
                          {CHANNEL_ICONS[isEditing ? editForm.channel : tp.channel]}
                        </div>
                      </div>
                      {/* Content */}
                      <div style={{ flex: 1, background: "var(--surface)", border: `1px solid ${isEditing ? "var(--primary)" : "var(--border)"}`, borderRadius: 10, padding: "10px 14px" }}>
                        {isEditing ? (
                          /* Edit mode */
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                              <select className="form-select" style={{ marginBottom: 0, width: "auto" }} value={editForm.channel} onChange={(e) => {
                                const channel = e.target.value;
                                setEditForm((f) => ({ ...f, channel, status: CHANNEL_OUTCOMES[channel].includes(f.status) ? f.status : CHANNEL_OUTCOMES[channel][0] }));
                              }}>
                                {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_ICONS[c]} {c}</option>)}
                              </select>
                              <select className="form-select" style={{ marginBottom: 0, width: "auto" }} value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}>
                                {CHANNEL_OUTCOMES[editForm.channel].map((s) => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <input type="date" className="form-input" style={{ marginBottom: 0, width: "auto" }} value={editForm.date} onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))} />
                            </div>
                            <textarea className="form-textarea" rows={2} style={{ marginBottom: 0 }} value={editForm.note} placeholder="Note…" onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))} />
                            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => { setEditingTp(null); setEditForm(null); }}>Cancel</button>
                              <button className="btn btn-primary btn-sm" onClick={() => {
                                dispatch({ type: "EDIT_TOUCHPOINT", payload: { prospectId: prospect.id, touchpointId: tp.id, updates: { channel: editForm.channel, status: editForm.status, date: editForm.date, time: nowTimeStr(), note: editForm.note.trim() } } });
                                setEditingTp(null);
                                setEditForm(null);
                              }}>Save</button>
                            </div>
                          </div>
                        ) : (
                          /* View mode */
                          <>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: tp.note ? 8 : 0 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{tp.channel}</span>
                              <Badge status={tp.status} />
                              {statusChanged && idx > 0 && (
                                <span style={{ fontSize: 11, background: "var(--primary-bg)", border: "1px solid var(--primary)", borderRadius: 20, padding: "1px 8px", color: "var(--primary-light)" }}>
                                  status updated
                                </span>
                              )}
                              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--mono)", whiteSpace: "nowrap" }}>
                                {tp.time && <>{tp.time} · </>}
                                {new Date(tp.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                              </span>
                              <button
                                className="btn btn-ghost btn-sm btn-icon"
                                title="Edit touchpoint"
                                style={{ padding: "2px 7px", fontSize: 13 }}
                                onClick={() => { setEditingTp(tp.id); setEditForm({ channel: tp.channel, status: tp.status, date: tp.date, time: tp.time || "", note: tp.note || "" }); }}
                              >✏️</button>
                              <button
                                className="btn btn-danger btn-sm btn-icon"
                                title="Delete touchpoint"
                                style={{ padding: "2px 7px", fontSize: 13 }}
                                onClick={() => dispatch({ type: "DELETE_TOUCHPOINT", payload: { prospectId: prospect.id, touchpointId: tp.id } })}
                              >×</button>
                            </div>
                            {tp.note && (
                              <div style={{ fontSize: 13, color: "var(--text-sec)", lineHeight: 1.6, borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 4 }}>
                                {tp.note}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 4 }} onClick={() => setTab("log")}>+ Log New Touchpoint</button>
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
            <div style={{ background: "var(--bg)", border: "1px solid var(--success-border)", borderRadius: 10, padding: "14px 16px", marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--success-bright)", marginBottom: 12, letterSpacing: "0.02em", textTransform: "uppercase" }}>
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
                  style={{ background: "var(--success-border)", border: "1px solid var(--success-bright)" }}
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

      {/* Email tab — Gmail integration */}
      {tab === "email" && (
        <div style={{ padding: "8px 0" }}>
          {/* Gmail connection status */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                {gmailStatus?.connected ? `Connected: ${gmailStatus.email}` : "Gmail not connected"}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                {gmailStatus?.connected ? "Send emails and auto-detect replies" : "Connect Gmail to send emails directly from here"}
              </div>
            </div>
            {gmailStatus?.connected ? (
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-outline btn-sm" onClick={syncGmailReplies} disabled={syncing_}>
                  {syncing_ ? "Syncing…" : "Sync Replies"}
                </button>
                <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={disconnectGmail}>
                  Disconnect
                </button>
              </div>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={connectGmail} disabled={gmailLoading}>
                {gmailLoading ? "Connecting…" : "Connect Gmail"}
              </button>
            )}
          </div>

          {/* Sync result */}
          {syncResult && (
            <div style={{ padding: "8px 14px", borderRadius: 8, marginBottom: 12, background: syncResult.error ? "var(--danger-bg)" : "var(--success-bg)", border: `1px solid ${syncResult.error ? "var(--danger-border)" : "var(--success-border)"}` }}>
              {syncResult.error ? (
                <span style={{ fontSize: 13, color: "var(--danger)" }}>{syncResult.error}</span>
              ) : (
                <span style={{ fontSize: 13, color: "var(--success-bright)" }}>
                  {syncResult.replies > 0 ? `Found ${syncResult.replies} reply(ies) — touchpoint logged!` : "No new replies found."}
                  {syncResult.sent > 0 && ` · ${syncResult.sent} sent email(s) detected.`}
                </span>
              )}
            </div>
          )}

          {/* Email compose form */}
          {gmailStatus?.connected ? (
            <div>
              {!prospect.email ? (
                <div style={{ textAlign: "center", padding: "28px 16px" }}>
                  <div style={{ fontSize: 26, marginBottom: 8 }}>✉️</div>
                  <div style={{ fontSize: 14, color: "var(--text-muted)" }}>
                    No email address for this prospect. Add one above or use the <strong>Enrich</strong> tab to find it.
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>To: <strong style={{ color: "var(--text)" }}>{prospect.email}</strong></div>
                  <input
                    className="form-input"
                    placeholder="Subject line…"
                    value={emailForm.subject}
                    onChange={(e) => setEmailForm((f) => ({ ...f, subject: e.target.value }))}
                    style={{ marginBottom: 8 }}
                  />
                  <textarea
                    className="form-textarea"
                    rows={8}
                    placeholder={`Hi ${prospect.name?.split(" ")[0] || ""},\n\n`}
                    value={emailForm.body}
                    onChange={(e) => setEmailForm((f) => ({ ...f, body: e.target.value }))}
                    style={{ marginBottom: 12 }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      className="btn btn-primary"
                      onClick={sendEmail}
                      disabled={sending || !emailForm.subject.trim() || !emailForm.body.trim()}
                    >
                      {sending ? "Sending…" : "Send via Gmail"}
                    </button>
                    <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                      Auto-logs as Email touchpoint
                    </span>
                  </div>
                  {sendResult?.success && (
                    <div style={{ marginTop: 10, padding: "8px 14px", background: "var(--success-bg)", border: "1px solid var(--success-border)", borderRadius: 8, fontSize: 13, color: "var(--success-bright)" }}>
                      Email sent successfully! Touchpoint logged.
                    </div>
                  )}
                  {sendResult?.error && (
                    <div style={{ marginTop: 10, padding: "8px 14px", background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 8, fontSize: 13, color: "var(--danger)" }}>
                      {sendResult.error}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "28px 16px" }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>✉️</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>Send Emails Directly</div>
              <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 4, maxWidth: 340, margin: "0 auto" }}>
                Connect your Gmail account to send emails from here, auto-log touchpoints, and detect replies automatically.
              </div>
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 16 }}>
                Requires: GOOGLE_CLIENT_ID &amp; GOOGLE_CLIENT_SECRET env vars
              </div>
              <button className="btn btn-primary" onClick={connectGmail} disabled={gmailLoading}>
                {gmailLoading ? "Connecting…" : "Connect Gmail Account"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Enrich tab — AI-powered prospect enrichment */}
      {tab === "enrich" && (
        <div style={{ padding: "8px 0" }}>
          {/* Current enrichment data */}
          {prospect.enrichment && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
              <div className="flex items-center justify-between mb-12">
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.02em", textTransform: "uppercase" }}>
                  Enriched Data
                </div>
                <div className="mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  {prospect.enrichment.enrichedAt ? new Date(prospect.enrichment.enrichedAt).toLocaleDateString() : ""}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", fontSize: 13 }}>
                {prospect.enrichment.companySize && (
                  <div><span style={{ color: "var(--text-muted)" }}>Company Size:</span> <span style={{ color: "var(--text)", fontWeight: 500 }}>{prospect.enrichment.companySize}</span></div>
                )}
                {prospect.enrichment.companyRevenue && (
                  <div><span style={{ color: "var(--text-muted)" }}>Revenue:</span> <span style={{ color: "var(--text)", fontWeight: 500 }}>{prospect.enrichment.companyRevenue}</span></div>
                )}
                {prospect.enrichment.companyFunding && (
                  <div><span style={{ color: "var(--text-muted)" }}>Funding:</span> <span style={{ color: "var(--text)", fontWeight: 500 }}>{prospect.enrichment.companyFunding}</span></div>
                )}
                {prospect.enrichment.companyWebsite && (
                  <div><span style={{ color: "var(--text-muted)" }}>Website:</span> <a href={prospect.enrichment.companyWebsite} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary-light)" }}>{prospect.enrichment.companyWebsite}</a></div>
                )}
              </div>
              {prospect.enrichment.technologies?.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Technologies: </span>
                  {prospect.enrichment.technologies.map((t) => (
                    <span key={t} style={{ display: "inline-block", fontSize: 11, background: "var(--primary-bg)", border: "1px solid var(--primary)", borderRadius: 12, padding: "1px 8px", margin: "2px 3px 2px 0", color: "var(--primary-light)" }}>{t}</span>
                  ))}
                </div>
              )}
              {prospect.enrichment.recentNews && (
                <div style={{ marginTop: 10, fontSize: 13, color: "var(--text-sec)", padding: "8px 10px", background: "var(--bg)", borderRadius: 6, border: "1px solid var(--border)" }}>
                  <span style={{ fontWeight: 600, color: "var(--warning-alt)" }}>News: </span>{prospect.enrichment.recentNews}
                </div>
              )}
              {prospect.enrichment.personalNote && (
                <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-sec)", padding: "8px 10px", background: "var(--bg)", borderRadius: 6, border: "1px solid var(--border)" }}>
                  <span style={{ fontWeight: 600, color: "var(--accent)" }}>Personal: </span>{prospect.enrichment.personalNote}
                </div>
              )}
            </div>
          )}

          {/* Enrich action */}
          <div style={{ textAlign: "center", padding: prospect.enrichment ? "8px 16px" : "28px 16px" }}>
            {!prospect.enrichment && (
              <>
                <div style={{ fontSize: 28, marginBottom: 10 }}>✨</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>AI Lead Enrichment</div>
                <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 20, maxWidth: 380, margin: "0 auto 20px" }}>
                  Claude will search the web to find missing contact info, company data, tech stack, recent news, and personal details for <strong style={{ color: "var(--text)" }}>{prospect.name}</strong> at <strong style={{ color: "var(--text)" }}>{prospect.company}</strong>.
                </div>
              </>
            )}

            {enriching && (
              <div style={{ padding: "16px" }}>
                <div style={{ fontSize: 20, marginBottom: 8 }}>⏳</div>
                <div style={{ fontSize: 14, color: "var(--text-muted)" }}>Searching the web for data…</div>
                <div className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>This takes 10–20 seconds</div>
              </div>
            )}

            {enrichError && (
              <div style={{ padding: "12px", background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 8, marginBottom: 12, textAlign: "left" }}>
                <div style={{ color: "var(--danger)", fontSize: 14 }}>{enrichError}</div>
              </div>
            )}

            {!enriching && (
              <button className="btn btn-primary" onClick={enrichProspect}>
                {prospect.enrichment ? "Re-enrich Prospect" : `Enrich ${prospect.name}`} →
              </button>
            )}

            {prospect.enrichment && (
              <div style={{ marginTop: 12 }}>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    const e = prospect.enrichment;
                    const parts = [
                      e.companySize ? `Company Size: ${e.companySize}` : null,
                      e.companyRevenue ? `Revenue: ${e.companyRevenue}` : null,
                      e.companyFunding ? `Funding: ${e.companyFunding}` : null,
                      e.technologies?.length ? `Tech: ${e.technologies.join(", ")}` : null,
                      e.recentNews ? `News: ${e.recentNews}` : null,
                      e.personalNote ? `Personal: ${e.personalNote}` : null,
                    ].filter(Boolean).join("\n");
                    const note = `--- Enrichment Data (${new Date().toLocaleDateString()}) ---\n${parts}`;
                    dispatch({ type: "UPDATE_PROSPECT", payload: { id: prospect.id, updates: { notes: prospect.notes ? prospect.notes + "\n\n" + note : note } } });
                  }}
                >
                  Save to Notes
                </button>
              </div>
            )}
          </div>
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
            <div style={{ padding: "16px", background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 8, marginBottom: 12 }}>
              <div style={{ color: "var(--danger)", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Research failed</div>
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
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="btn btn-ghost btn-sm" onClick={fetchResearch} title="Refresh research">↻ Refresh</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => dispatch({ type: "UPDATE_PROSPECT", payload: { id: prospect.id, updates: { research: null } } })} title="Delete research">🗑 Delete</button>
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
              <div style={{ padding: "14px", background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 8 }}>
                <div style={{ color: "var(--danger)", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Lookup failed</div>
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
