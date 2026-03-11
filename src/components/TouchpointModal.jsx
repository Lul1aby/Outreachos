import { useState } from "react";
import { CHANNELS, STATUSES, CHANNEL_ICONS } from "../constants";
import { todayStr } from "../utils";
import { useStore } from "../store";
import { Modal, Select, Textarea, Input } from "./ui";

export default function TouchpointModal({ prospectId, onClose }) {
  const { state, dispatch } = useStore();
  const prospect = state.prospects.find((p) => p.id === prospectId);
  const [form, setForm] = useState({
    channel: "Email",
    date: todayStr(),
    status: prospect?.status || "No Response",
    note: "",
  });

  if (!prospect) return null;

  function save() {
    dispatch({
      type: "ADD_TOUCHPOINT",
      payload: {
        prospectId,
        touchpoint: { channel: form.channel, date: form.date, note: form.note.trim(), status: form.status },
        newStatus: form.status,
      },
    });
    onClose();
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
        onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
      />
      <Input
        label="Date"
        type="date"
        value={form.date}
        onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
      />
      <Select
        label="Outcome / New Status"
        options={STATUSES}
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
      <div className="flex gap-8 justify-end mt-8">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save}>Save Touchpoint</button>
      </div>
    </Modal>
  );
}
