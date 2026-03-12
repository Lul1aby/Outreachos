import { useState, useRef, useEffect } from "react";
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

/* ── Calendar date picker ── */
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function CalendarPicker({ value, onChange }) {
  // value: "YYYY-MM-DD" string
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
  const [view, setView] = useState(() => {
    if (value) { const [y, m] = value.split("-"); return { year: +y, month: +m - 1 }; }
    return { year: today.getFullYear(), month: today.getMonth() };
  });
  const ref = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function toggleOpen() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const dropW = 240, dropH = 280;
      const left = Math.min(rect.left, window.innerWidth - dropW - 8);
      const top = rect.bottom + dropH > window.innerHeight
        ? rect.top - dropH - 4   // flip above if no room below
        : rect.bottom + 6;
      setDropPos({ top, left });
    }
    setOpen((o) => !o);
  }

  const selected = value ? new Date(value + "T00:00:00") : null;
  const todayStr = today.toISOString().slice(0, 10);

  // Days in grid
  const firstDay = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function selectDay(d) {
    const m = String(view.month + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    onChange(`${view.year}-${m}-${dd}`);
    setOpen(false);
  }

  function prevMonth() {
    setView((v) => v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 });
  }
  function nextMonth() {
    setView((v) => v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 });
  }

  const displayVal = selected
    ? selected.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "Pick a date";

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        ref={btnRef}
        type="button"
        className="form-input"
        style={{ cursor: "pointer", textAlign: "left", minWidth: 148, display: "flex", alignItems: "center", gap: 8 }}
        onClick={toggleOpen}
      >
        <span style={{ fontSize: 14 }}>📅</span>
        <span style={{ fontSize: 14, color: selected ? "var(--text)" : "var(--text-dim)" }}>{displayVal}</span>
      </button>

      {open && (
        <div style={{
          position: "fixed", top: dropPos.top, left: dropPos.left, zIndex: 9999,
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
          padding: 12, width: 240, boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}>
          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <button type="button" onClick={prevMonth} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 16, padding: "2px 6px" }}>‹</button>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{MONTHS[view.month]} {view.year}</span>
            <button type="button" onClick={nextMonth} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 16, padding: "2px 6px" }}>›</button>
          </div>

          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
            {DAYS.map((d) => (
              <div key={d} style={{ textAlign: "center", fontSize: 11, color: "var(--text-dim)", fontWeight: 600, padding: "2px 0" }}>{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={`e${i}`} />;
              const m = String(view.month + 1).padStart(2, "0");
              const dd = String(d).padStart(2, "0");
              const iso = `${view.year}-${m}-${dd}`;
              const isSelected = value === iso;
              const isToday = iso === todayStr;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => selectDay(d)}
                  style={{
                    textAlign: "center", fontSize: 13, padding: "5px 2px",
                    borderRadius: 6, border: "none", cursor: "pointer",
                    background: isSelected ? "var(--primary)" : isToday ? "rgba(99,102,241,0.15)" : "transparent",
                    color: isSelected ? "#fff" : isToday ? "var(--primary-light)" : "var(--text-sec)",
                    fontWeight: isSelected || isToday ? 700 : 400,
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>

          {/* Today shortcut */}
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)", textAlign: "center" }}>
            <button type="button" onClick={() => { onChange(todayStr); setOpen(false); }} style={{ background: "none", border: "none", color: "var(--primary-light)", fontSize: 12, cursor: "pointer", fontFamily: "var(--font)" }}>
              Today
            </button>
          </div>
        </div>
      )}
    </div>
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
