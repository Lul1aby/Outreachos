import { useState } from "react";
import { CHANNELS, CHANNEL_OUTCOMES, CHANNEL_ICONS } from "../constants";
import { todayStr } from "../utils";
import { useStore } from "../store";
import { Modal, Select, Textarea, Input, CalendarPicker } from "./ui";

export default function TouchpointModal({ prospectId, onClose }) {
  const { state, dispatch } = useStore();
  const prospect = state.prospects.find((p) => p.id === prospectId);
  const [form, setForm] = useState(() => {
    const channel = "Call";
    return { channel, date: todayStr(), status: CHANNEL_OUTCOMES[channel][0], note: "" };
  });

  /* Meeting scheduler */
  const [meetDate, setMeetDate] = useState(todayStr());
  const [meetTime, setMeetTime] = useState("10:00");
  const [meetDuration, setMeetDuration] = useState("60");

  /* HubSpot sync */
  const [syncHubspot, setSyncHubspot] = useState(false);
  const [hubspotStatus, setHubspotStatus] = useState(null); // null | "syncing" | "ok:{name}" | "err:{msg}"

  if (!prospect) return null;

  async function save() {
    const tp = { channel: form.channel, date: form.date, note: form.note.trim(), status: form.status };
    dispatch({ type: "ADD_TOUCHPOINT", payload: { prospectId, touchpoint: tp, newStatus: form.status } });

    if (syncHubspot && prospect.email) {
      setHubspotStatus("syncing");
      try {
        const res = await fetch("/api/hubspot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: prospect.email, prospectName: prospect.name, company: prospect.company, touchpoint: tp }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "HubSpot sync failed");
        setHubspotStatus(`ok:${data.contactName}`);
        setTimeout(onClose, 1800);
      } catch (err) {
        setHubspotStatus(`err:${err.message}`);
      }
    } else {
      onClose();
    }
  }

  function openGoogleCal() {
    const [y, m, d] = meetDate.split("-");
    const [hh, mm] = meetTime.split(":");
    const start = new Date(+y, +m - 1, +d, +hh, +mm);
    const end = new Date(start.getTime() + +meetDuration * 60000);
    const fmt = (dt) =>
      dt.getFullYear().toString()
      + String(dt.getMonth() + 1).padStart(2, "0")
      + String(dt.getDate()).padStart(2, "0")
      + "T" + String(dt.getHours()).padStart(2, "0")
      + String(dt.getMinutes()).padStart(2, "0") + "00";
    const title = encodeURIComponent(`Meeting with ${prospect.name} (${prospect.company})`);
    const dates = `${fmt(start)}/${fmt(end)}`;
    const add = prospect.email ? `&add=${encodeURIComponent(prospect.email)}` : "";
    const details = encodeURIComponent(
      `Prospect: ${prospect.name}\nCompany: ${prospect.company}${prospect.title ? `\nTitle: ${prospect.title}` : ""}${prospect.phone ? `\nPhone: ${prospect.phone}` : ""}`
    );
    window.open(
      `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}${add}`,
      "_blank"
    );
  }

  return (
    <Modal onClose={onClose}>
      <div className="modal-header">
        <div>
          <div className="modal-title">Log Touchpoint</div>
          <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>
            {prospect.name} · {prospect.company}
          </div>
        </div>
        <button className="modal-close" onClick={onClose}>×</button>
      </div>
      <Select
        label="Channel"
        options={CHANNELS}
        value={form.channel}
        onChange={(e) => {
          const channel = e.target.value;
          setForm((f) => ({ ...f, channel, status: CHANNEL_OUTCOMES[channel][0] }));
        }}
      />
      <Input
        label="Date"
        type="date"
        value={form.date}
        onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
      />
      <Select
        label="Outcome"
        options={CHANNEL_OUTCOMES[form.channel]}
        value={form.status}
        onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
      />
      <Textarea
        label="Note"
        rows={3}
        value={form.note}
        placeholder="What happened? Key takeaways, next steps…"
        onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
      />

      {/* Google Calendar — shown when Meeting Booked is selected */}
      {form.status === "Meeting Booked" && (
        <div style={{ background: "var(--surface)", border: "1px solid #2d4a2d", borderRadius: 10, padding: "14px 16px", marginTop: 8, marginBottom: 4 }}>
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
              onClick={openGoogleCal}
            >
              Open Google Calendar →
            </button>
          </div>
        </div>
      )}

      {/* HubSpot sync option */}
      {prospect.email && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, color: "var(--text-sec)" }}>
            <input
              type="checkbox"
              checked={syncHubspot}
              onChange={(e) => { setSyncHubspot(e.target.checked); setHubspotStatus(null); }}
              style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#f97316" }}
            />
            <span>🔗 Also log in HubSpot</span>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>({prospect.email})</span>
          </label>
          {hubspotStatus === "syncing" && (
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>⏳ Syncing to HubSpot…</div>
          )}
          {hubspotStatus?.startsWith("ok:") && (
            <div style={{ fontSize: 13, color: "#4ade80", marginTop: 6 }}>✓ Logged on HubSpot contact: <strong>{hubspotStatus.slice(3)}</strong></div>
          )}
          {hubspotStatus?.startsWith("err:") && (
            <div style={{ fontSize: 13, color: "#f87171", marginTop: 6 }}>✕ {hubspotStatus.slice(4)}</div>
          )}
        </div>
      )}

      <div className="flex gap-8 justify-end mt-12">
        <button className="btn btn-ghost" onClick={onClose} disabled={hubspotStatus === "syncing"}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={hubspotStatus === "syncing"}>
          {hubspotStatus === "syncing" ? "Saving…" : "Save Touchpoint"}
        </button>
      </div>
    </Modal>
  );
}
