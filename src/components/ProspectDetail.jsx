import { useState, useMemo, useCallback } from "react";
import { useStore } from "../store";
import { STATUSES, STATUS_COLORS, CHANNELS, CHANNEL_ICONS } from "../constants";
import { todayStr } from "../utils";
import { Modal, Badge, TpBadge, StatusPill, Select, Textarea, Input } from "./ui";

export default function ProspectDetail({ prospectId, onClose, onLogTouchpoint, onSelect }) {
  const { state, dispatch } = useStore();
  const prospect = state.prospects.find((p) => p.id === prospectId);
  const originalProspect = prospect?.duplicateOfId ? state.prospects.find((p) => p.id === prospect.duplicateOfId) : null;
  const originalUploader = originalProspect?.uploadedBy ? state.users?.find((u) => u.id === originalProspect.uploadedBy)?.name : null;
  const [tab, setTab] = useState("touchpoints");

  /* Inline touchpoint form state */
  const [tpForm, setTpForm] = useState({ channel: "Email", date: todayStr(), note: "", status: "Contacted" });

  /* Inline reminder-style form (we use the touchpoint form here) */
  const touchpoints = prospect?.touchpoints || [];

  const logInline = useCallback(() => {
    if (!tpForm.note.trim()) return;
    dispatch({
      type: "ADD_TOUCHPOINT",
      payload: {
        prospectId,
        touchpoint: { channel: tpForm.channel, date: tpForm.date, note: tpForm.note.trim(), status: tpForm.status },
        newStatus: tpForm.status,
      },
    });
    setTpForm({ channel: "Email", date: todayStr(), note: "", status: "Contacted" });
  }, [tpForm, prospectId, dispatch]);

  if (!prospect) return null;

  return (
    <Modal onClose={onClose} wide>
      {/* Header */}
      <div className="modal-header">
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>{prospect.name}</div>
          <div style={{ fontSize: 13, color: "var(--text-sec)", marginTop: 4 }}>
            {prospect.title} at <span style={{ color: "var(--text)", fontWeight: 500 }}>{prospect.company}</span>
          </div>
        </div>
        <div className="flex gap-8 items-center">
          <Badge status={prospect.status} />
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
      </div>

      {/* Duplicate warning */}
      {prospect.isDuplicate && (
        <div style={{ background: "#2a1520", border: "1px solid #7f1d1d", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#f87171", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span>
            ⚠ Duplicate lead —{" "}
            {originalUploader
              ? <><strong>{originalUploader}</strong> already owns this contact</>
              : <>this contact was already uploaded earlier</>}
            {originalProspect && <> ({originalProspect.createdAt})</>}.
          </span>
          {originalProspect && onSelect && (
            <button
              onClick={() => { onClose(); onSelect(originalProspect.id); }}
              style={{ background: "none", border: "1px solid #7f1d1d", borderRadius: 6, color: "#f87171", fontSize: 12, cursor: "pointer", padding: "4px 10px", fontFamily: "var(--font)", whiteSpace: "nowrap", flexShrink: 0 }}
            >
              View Original →
            </button>
          )}
        </div>
      )}

      {/* Contact info */}
      <div className="detail-info">
        {prospect.email && <div className="detail-info-item">✉️ {prospect.email}</div>}
        {prospect.phone && <div className="detail-info-item">📞 {prospect.phone}</div>}
        {prospect.linkedin && <div className="detail-info-item">💼 {prospect.linkedin}</div>}
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

      {/* Tabs */}
      <div className="tab-switcher" style={{ maxWidth: 360 }}>
        <button className={`tab-switch${tab === "touchpoints" ? " active" : ""}`} onClick={() => setTab("touchpoints")}>
          Touchpoints ({touchpoints.length})
        </button>
        <button className={`tab-switch${tab === "log" ? " active" : ""}`} onClick={() => setTab("log")}>
          + Log New
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
            <select className="form-select" value={tpForm.channel} onChange={(e) => setTpForm((f) => ({ ...f, channel: e.target.value }))}>
              {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_ICONS[c]} {c}</option>)}
            </select>
            <input type="date" className="form-input" value={tpForm.date} onChange={(e) => setTpForm((f) => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="inline-row">
            <select className="form-select" value={tpForm.status} onChange={(e) => setTpForm((f) => ({ ...f, status: e.target.value }))}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="inline-row">
            <textarea className="form-textarea" rows={3} value={tpForm.note} placeholder="What happened? Key takeaways, next steps…" onChange={(e) => setTpForm((f) => ({ ...f, note: e.target.value }))} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={logInline}>Log Touchpoint</button>
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
