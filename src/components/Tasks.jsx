import { useStore } from "../store";
import { CHANNEL_ICONS } from "../constants";
import { todayStr } from "../utils";
import { Badge } from "./ui";

export default function Tasks({ onSelect, onNavigate }) {
  const { tasksToday, dispatch } = useStore();
  const today = todayStr();

  return (
    <div style={{ padding: "24px 32px" }}>
      <div className="flex items-center justify-between mb-24">
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>✅ Today's Tasks</div>
          <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
            {tasksToday.length === 0 ? "All caught up 🎉" : `${tasksToday.length} task${tasksToday.length > 1 ? "s" : ""} due`}
          </div>
        </div>
      </div>

      {tasksToday.length === 0 && (
        <div className="empty">
          <div className="empty-icon">🎉</div>
          <div className="empty-msg" style={{ color: "var(--success)" }}>All caught up!</div>
          <div className="empty-sub">No tasks due today. Enroll prospects in a sequence to generate tasks.</div>
          <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={() => onNavigate("sequences")}>Go to Sequences →</button>
        </div>
      )}

      <div className="flex flex-col gap-10">
        {tasksToday.map((task, i) => {
          const isOverdue = task.dueDate < today;
          const stepIdx = task.seq.steps.findIndex((s) => s.id === task.step.id);
          const p = task.prospect;
          return (
            <div key={`${task.enrollmentId}-${task.step.id}`} className={`task-row${isOverdue ? " overdue" : ""}`}>
              <div className={`task-dot${isOverdue ? " overdue" : ""}`}>{CHANNEL_ICONS[task.step.channel]}</div>
              <div className="task-info">
                <div className="task-header">
                  <span className="task-name">{p.name}</span>
                  <span className="task-company">{p.company}</span>
                  <Badge status={p.status} />
                  {isOverdue && <span className="task-overdue-tag">OVERDUE</span>}
                </div>
                <div className="task-detail">
                  <span style={{ color: "var(--primary-light)" }} className="mono">{task.step.channel}</span>
                  <span style={{ color: "var(--text-dim)", margin: "0 6px" }}>·</span>
                  Step {stepIdx + 1} of {task.seq.steps.length} in <span style={{ color: "var(--primary)" }}>⚡ {task.seq.name}</span>
                  <span style={{ color: "var(--text-dim)", margin: "0 6px" }}>·</span>
                  <span className="mono" style={{ color: isOverdue ? "var(--warning-alt)" : "var(--text-muted)" }}>Due {task.dueDate}</span>
                </div>
                {task.step.note && <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>{task.step.note}</div>}
                <div className="task-contacts">
                  {p.email && <a href={`mailto:${p.email}`} className="task-contact-link contact-link-email">✉️ {p.email}</a>}
                  {p.phone && <a href={`tel:${p.phone}`} className="task-contact-link contact-link-phone">📞 {p.phone}</a>}
                  {p.linkedin && <a href={`https://${p.linkedin}`} target="_blank" rel="noopener noreferrer" className="task-contact-link" style={{ background: "var(--border)", border: "1px solid var(--input-border)", color: "var(--text-sec)" }}>💼 LinkedIn</a>}
                </div>
              </div>
              <div className="task-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => onSelect(p.id)}>View</button>
                <button className="btn btn-success btn-sm" onClick={() => dispatch({ type: "COMPLETE_STEP", payload: { enrollmentId: task.enrollmentId, stepId: task.step.id } })}>✓ Done</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
