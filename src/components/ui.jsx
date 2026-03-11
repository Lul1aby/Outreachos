import { STATUS_COLORS, CHANNEL_ICONS } from "../constants";

/* ── Modal ── */
export function Modal({ children, onClose, wide, narrow }) {
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal${wide ? " wide" : ""}${narrow ? " narrow" : ""}`} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/* ── Badge ── */
export function Badge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS["Not Started"];
  return (
    <span className="badge" style={{ background: c.bg, color: c.text, borderColor: c.border }}>
      {status}
    </span>
  );
}

/* ── Touchpoint badge ── */
export function TpBadge({ type }) {
  const cls = "tp-" + type.toLowerCase().replace(/[\s/]/g, "");
  return <span className={`tp-badge ${cls}`}>{type}</span>;
}

/* ── Form fields ── */
export function Input({ label, error, ...props }) {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <input className="form-input" {...props} />
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}

export function Select({ label, options, error, ...props }) {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <select className="form-select" {...props}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}

export function Textarea({ label, error, ...props }) {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <textarea className="form-textarea" {...props} />
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}

/* ── Status pill buttons ── */
export function StatusPill({ status, active, onClick }) {
  const c = STATUS_COLORS[status];
  return (
    <button
      onClick={onClick}
      className="btn btn-sm"
      style={{
        borderRadius: 20,
        border: `1px solid ${active ? c.border : "#2a2a3e"}`,
        background: active ? c.bg : "transparent",
        color: active ? c.text : "#6b7280",
        fontWeight: active ? 600 : 400,
      }}
    >
      {status}
    </button>
  );
}

/* ── Mini bar chart ── */
export function MiniBar({ pct, color, height = 5 }) {
  return (
    <div className="mini-bar" style={{ height }}>
      <div className="mini-bar-fill" style={{ width: `${Math.max(pct, 0)}%`, background: color, height: "100%" }} />
    </div>
  );
}
