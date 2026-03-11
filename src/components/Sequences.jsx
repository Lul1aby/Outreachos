import { useState } from "react";
import { useStore } from "../store";
import { CHANNELS, CHANNEL_ICONS } from "../constants";
import { nextId } from "../utils";
import { Modal, Input, Badge } from "./ui";

export default function Sequences() {
  const { state, dispatch } = useStore();
  const { sequences, enrollments, prospects } = state;
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: "", description: "", steps: [] });
  const [showAssign, setShowAssign] = useState(false);
  const [assignSeqId, setAssignSeqId] = useState(null);

  function openBuilder(seq = null) {
    if (seq) {
      setEditingId(seq.id);
      setForm({ name: seq.name, description: seq.description || "", steps: seq.steps.map((s) => ({ ...s })) });
    } else {
      setEditingId(null);
      setForm({ name: "", description: "", steps: [] });
    }
    setShowBuilder(true);
  }

  function addStep() {
    const maxDay = form.steps.length ? Math.max(...form.steps.map((s) => s.day)) : -1;
    setForm((f) => ({ ...f, steps: [...f.steps, { id: nextId(), day: maxDay + 3, channel: "Email", note: "" }] }));
  }

  function save() {
    if (!form.name || form.steps.length === 0) return;
    if (editingId) {
      dispatch({ type: "UPDATE_SEQUENCE", payload: { id: editingId, updates: { name: form.name, description: form.description, steps: form.steps } } });
    } else {
      dispatch({ type: "ADD_SEQUENCE", payload: { name: form.name, description: form.description, steps: form.steps } });
    }
    setShowBuilder(false);
  }

  return (
    <div style={{ padding: "24px 32px" }}>
      <div className="flex items-center justify-between mb-24">
        <div>
          <div style={{ fontSize: 19, fontWeight: 700 }}>⚡ Sequences</div>
          <div className="mono" style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 3 }}>Multi-step outreach cadences — assign to prospects for a daily task queue</div>
        </div>
        <button className="btn btn-primary" onClick={() => openBuilder()}>+ New Sequence</button>
      </div>

      {sequences.length === 0 && (
        <div className="empty"><div className="empty-icon">⚡</div><div className="empty-msg">No sequences yet</div><div className="empty-sub">Create a cadence, then assign it to prospects to generate daily tasks</div></div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
        {sequences.map((seq) => {
          const assigned = enrollments.filter((e) => e.sequenceId === seq.id);
          const active = assigned.filter((e) => {
            const lastStep = seq.steps[seq.steps.length - 1];
            return !lastStep || !e.completedSteps.includes(lastStep.id);
          });
          return (
            <div key={seq.id} className="seq-card" style={seq.isDefault ? { borderColor: "var(--primary)", boxShadow: "0 0 0 1px var(--primary-bg)" } : {}}>
              <div className="flex items-start justify-between mb-16">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center gap-8 flex-wrap">
                    <div style={{ fontSize: 16, fontWeight: 700 }}>⚡ {seq.name}</div>
                    {seq.isDefault && (
                      <span style={{ fontSize: 12, fontWeight: 600, background: "var(--primary-bg)", color: "var(--primary-light)", border: "1px solid var(--primary)", borderRadius: 6, padding: "1px 8px", whiteSpace: "nowrap" }}>
                        🔒 Default · Auto-assigned
                      </span>
                    )}
                  </div>
                  {seq.description && <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 3 }}>{seq.description}</div>}
                </div>
                <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8, flexShrink: 0 }} onClick={() => openBuilder(seq)}>Edit</button>
              </div>
              <div className="flex flex-col gap-6 mb-16">
                {seq.steps.map((step, i) => (
                  <div key={step.id}>
                    <div className="seq-step">
                      <div className="seq-step-dot">{CHANNEL_ICONS[step.channel]}</div>
                      <div className="flex-1">
                        <span className="seq-step-day">Day {step.day}</span>
                        <span className="seq-step-channel">{step.channel}</span>
                        {step.note && <div className="seq-step-note">{step.note}</div>}
                      </div>
                    </div>
                    {i < seq.steps.length - 1 && <div className="seq-step-line" />}
                  </div>
                ))}
              </div>
              <div className="seq-footer">
                <div className="flex gap-12">
                  <div className="seq-stat"><strong style={{ color: "var(--primary-light)" }}>{active.length}</strong> active</div>
                  <div className="seq-stat"><strong>{assigned.length}</strong> total enrolled</div>
                  <div className="seq-stat"><strong style={{ color: "var(--success)" }}>{seq.steps.length}</strong> steps · {seq.steps.length > 0 ? `${seq.steps[seq.steps.length - 1].day}d` : "0d"} span</div>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => { setAssignSeqId(seq.id); setShowAssign(true); }}>Enroll Prospects</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Builder modal */}
      {showBuilder && (
        <Modal onClose={() => setShowBuilder(false)}>
          <div className="modal-header">
            <div className="modal-title">{editingId ? "Edit Sequence" : "New Sequence"}</div>
            <button className="modal-close" onClick={() => setShowBuilder(false)}>×</button>
          </div>
          <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 20 }}>Define the steps and timing for your outreach cadence.</div>
          <Input label="Sequence Name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Cold Outbound Standard" />
          <Input label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Brief description of this cadence" />
          <div className="form-label" style={{ marginBottom: 10 }}>Steps</div>
          <div className="flex flex-col gap-8 mb-12">
            {form.steps.map((step, i) => (
              <div key={step.id} className="seq-builder-step">
                <span className="mono" style={{ fontSize: 14, color: "var(--text-muted)", width: 14 }}>{i + 1}</span>
                <div className="flex items-center gap-4" style={{ flexShrink: 0 }}>
                  <span className="mono" style={{ fontSize: 14, color: "var(--text-dim)" }}>Day</span>
                  <input type="number" min="0" className="seq-builder-day" value={step.day} onChange={(e) => setForm((f) => ({ ...f, steps: f.steps.map((s) => s.id === step.id ? { ...s, day: Number(e.target.value) } : s) }))} />
                </div>
                <select value={step.channel} onChange={(e) => setForm((f) => ({ ...f, steps: f.steps.map((s) => s.id === step.id ? { ...s, channel: e.target.value } : s) }))}>
                  {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input className="seq-builder-note" value={step.note} onChange={(e) => setForm((f) => ({ ...f, steps: f.steps.map((s) => s.id === step.id ? { ...s, note: e.target.value } : s) }))} placeholder="What to do / say…" />
                <button onClick={() => setForm((f) => ({ ...f, steps: f.steps.filter((s) => s.id !== step.id) }))} style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: 17, cursor: "pointer", lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
              </div>
            ))}
          </div>
          <button className="seq-add-step" onClick={addStep}>+ Add Step</button>
          <div className="flex gap-8 justify-end">
            <button className="btn btn-ghost" onClick={() => setShowBuilder(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save Sequence</button>
          </div>
        </Modal>
      )}

      {/* Assign modal */}
      {showAssign && (
        <Modal onClose={() => setShowAssign(false)}>
          <div className="modal-header">
            <div>
              <div className="modal-title">Enroll Prospects</div>
              <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>
                Enroll in <strong style={{ color: "var(--primary-light)" }}>⚡ {sequences.find((s) => s.id === assignSeqId)?.name}</strong>. Tasks start today.
              </div>
            </div>
            <button className="modal-close" onClick={() => setShowAssign(false)}>×</button>
          </div>
          <div style={{ maxHeight: 400, overflowY: "auto" }} className="flex flex-col gap-6">
            {prospects.filter((p) => !["Not Interested"].includes(p.status)).map((p) => {
              const enrolled = enrollments.some((e) => e.prospectId === p.id && e.sequenceId === assignSeqId);
              return (
                <div key={p.id} className={`enroll-row${enrolled ? " enrolled" : ""}`}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: enrolled ? "var(--text-dim)" : "var(--text)" }}>{p.name}</div>
                    <div style={{ fontSize: 14, color: "var(--text-muted)" }}>{p.company} · {p.title}</div>
                  </div>
                  <div className="flex items-center gap-8">
                    <Badge status={p.status} />
                    {enrolled
                      ? <span className="mono" style={{ fontSize: 14, color: "var(--success-bright)" }}>✓ enrolled</span>
                      : <button className="btn btn-outline btn-sm" onClick={() => dispatch({ type: "ENROLL_PROSPECT", payload: { prospectId: p.id, sequenceId: assignSeqId } })}>Enroll</button>
                    }
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end mt-16">
            <button className="btn btn-ghost" onClick={() => setShowAssign(false)}>Done</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
