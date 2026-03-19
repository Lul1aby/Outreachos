import { useState, useMemo, useCallback } from "react";
import { useStore } from "../store";
import { CHANNELS, CHANNEL_ICONS } from "../constants";
import { todayStr, normalizeLinkedIn } from "../utils";
import { Badge } from "./ui";

export default function Tasks({ onSelect, onNavigate }) {
  const { tasksToday, dispatch } = useStore();
  const today = todayStr();
  const [copied, setCopied] = useState(null);

  /* ── Filters ── */
  const [filterChannel, setFilterChannel] = useState("All");
  const [filterPriority, setFilterPriority] = useState("All"); // All | Overdue | Today
  const [sortMode, setSortMode] = useState("priority"); // priority | channel | company | name
  const [search, setSearch] = useState("");

  const copyContact = useCallback((e, text, enrollmentId, field) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied({ enrollmentId, field });
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => {});
  }, []);

  /* ── Filtered + sorted tasks ── */
  const filteredTasks = useMemo(() => {
    let tasks = tasksToday;

    // Channel filter
    if (filterChannel !== "All") {
      tasks = tasks.filter((t) => t.step.channel === filterChannel);
    }

    // Priority filter
    if (filterPriority === "Overdue") {
      tasks = tasks.filter((t) => t.dueDate < today);
    } else if (filterPriority === "Today") {
      tasks = tasks.filter((t) => t.dueDate === today);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      tasks = tasks.filter((t) =>
        t.prospect.name.toLowerCase().includes(q) ||
        t.prospect.company.toLowerCase().includes(q)
      );
    }

    // Sort
    return [...tasks].sort((a, b) => {
      if (sortMode === "priority") {
        // Overdue first, then by date, then by step day
        const aOver = a.dueDate < today ? 0 : 1;
        const bOver = b.dueDate < today ? 0 : 1;
        if (aOver !== bOver) return aOver - bOver;
        if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        return a.step.day - b.step.day;
      }
      if (sortMode === "channel") return a.step.channel.localeCompare(b.step.channel);
      if (sortMode === "company") return a.prospect.company.localeCompare(b.prospect.company);
      if (sortMode === "name") return a.prospect.name.localeCompare(b.prospect.name);
      return 0;
    });
  }, [tasksToday, filterChannel, filterPriority, search, sortMode, today]);

  /* ── Stats ── */
  const overdueCount = useMemo(() => tasksToday.filter((t) => t.dueDate < today).length, [tasksToday, today]);
  const todayCount = useMemo(() => tasksToday.filter((t) => t.dueDate === today).length, [tasksToday, today]);

  // Channels that have tasks
  const taskChannels = useMemo(() => {
    const set = new Set(tasksToday.map((t) => t.step.channel));
    return CHANNELS.filter((c) => set.has(c));
  }, [tasksToday]);

  // Channel counts
  const channelCounts = useMemo(() => {
    const map = {};
    tasksToday.forEach((t) => { map[t.step.channel] = (map[t.step.channel] || 0) + 1; });
    return map;
  }, [tasksToday]);

  const completeAll = useCallback(() => {
    if (!filteredTasks.length) return;
    if (!window.confirm(`Complete all ${filteredTasks.length} visible tasks?`)) return;
    filteredTasks.forEach((t) => {
      dispatch({ type: "COMPLETE_STEP", payload: { enrollmentId: t.enrollmentId, stepId: t.step.id } });
    });
  }, [filteredTasks, dispatch]);

  return (
    <div style={{ padding: "24px 32px" }}>
      {/* Header + stats */}
      <div className="flex items-center justify-between mb-16">
        <div>
          <div style={{ fontSize: 19, fontWeight: 700 }}>Today's Tasks</div>
          <div className="mono" style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 3 }}>
            {tasksToday.length === 0 ? "All caught up!" : `${tasksToday.length} task${tasksToday.length > 1 ? "s" : ""} due`}
          </div>
        </div>
        {tasksToday.length > 0 && (
          <div className="flex gap-8 items-center">
            <button className="btn btn-success btn-sm" onClick={completeAll} disabled={filteredTasks.length === 0}>
              Done All ({filteredTasks.length})
            </button>
          </div>
        )}
      </div>

      {/* Priority chips */}
      {tasksToday.length > 0 && (
        <div className="flex gap-8 items-center flex-wrap mb-16">
          {/* Priority filter */}
          {[
            { key: "All", label: "All", count: tasksToday.length },
            { key: "Overdue", label: "Overdue", count: overdueCount, color: "var(--danger)" },
            { key: "Today", label: "Due Today", count: todayCount, color: "var(--success)" },
          ].map((opt) => (
            <button
              key={opt.key}
              className={`dormant-chip${filterPriority === opt.key ? " active" : ""}`}
              onClick={() => setFilterPriority(opt.key)}
              style={filterPriority === opt.key && opt.color ? { borderColor: opt.color, color: opt.color, background: `${opt.color}15` } : {}}
            >
              {opt.label}
              <span className={`dormant-count${filterPriority === opt.key ? " active" : ""}`}
                style={filterPriority === opt.key && opt.color ? { background: `${opt.color}25`, color: opt.color } : {}}>
                {opt.count}
              </span>
            </button>
          ))}

          <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 4px" }} />

          {/* Channel filter */}
          <button
            className={`dormant-chip${filterChannel === "All" ? " active" : ""}`}
            onClick={() => setFilterChannel("All")}
          >
            All Channels
          </button>
          {taskChannels.map((c) => (
            <button
              key={c}
              className={`dormant-chip${filterChannel === c ? " active" : ""}`}
              onClick={() => setFilterChannel(filterChannel === c ? "All" : c)}
            >
              {CHANNEL_ICONS[c]} {c}
              <span className={`dormant-count${filterChannel === c ? " active" : ""}`}>{channelCounts[c]}</span>
            </button>
          ))}

          <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 4px" }} />

          {/* Sort */}
          <select
            className="form-select"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value)}
            style={{ marginBottom: 0, fontSize: 13, minWidth: 120, padding: "4px 8px", borderRadius: 6 }}
          >
            <option value="priority">Sort: Priority</option>
            <option value="channel">Sort: Channel</option>
            <option value="company">Sort: Company</option>
            <option value="name">Sort: Name</option>
          </select>

          {/* Search */}
          <input
            type="text"
            className="form-input"
            placeholder="Search name, company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: 0, fontSize: 13, maxWidth: 200, padding: "5px 10px", borderRadius: 6 }}
          />
        </div>
      )}

      {tasksToday.length === 0 && (
        <div className="empty">
          <div className="empty-icon">🎉</div>
          <div className="empty-msg" style={{ color: "var(--success)" }}>All caught up!</div>
          <div className="empty-sub">No tasks due today. Enroll prospects in a sequence to generate tasks.</div>
          <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={() => onNavigate("sequences")}>Go to Sequences →</button>
        </div>
      )}

      {tasksToday.length > 0 && filteredTasks.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: 14 }}>
          No tasks match your filters.
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => { setFilterChannel("All"); setFilterPriority("All"); setSearch(""); }}>Clear filters</button>
        </div>
      )}

      <div className="flex flex-col gap-10">
        {filteredTasks.map((task) => {
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
                  Step {stepIdx + 1} of {task.seq.steps.length} in <span style={{ color: "var(--primary)" }}>{task.seq.name}</span>
                  <span style={{ color: "var(--text-dim)", margin: "0 6px" }}>·</span>
                  <span className="mono" style={{ color: isOverdue ? "var(--warning-alt)" : "var(--text-muted)" }}>Due {task.dueDate}</span>
                </div>
                {task.step.note && <div style={{ fontSize: 14, color: "var(--text-muted)", fontStyle: "italic" }}>{task.step.note}</div>}
                {task.step._swappedFromLinkedIn && (
                  <div style={{ fontSize: 12, color: "#fbbf24", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 14 }}>💼</span> LinkedIn connection pending — swapped to email
                  </div>
                )}
                <div className="task-contacts">
                  {p.email && (
                    <button onClick={(e) => copyContact(e, p.email, task.enrollmentId, "email")} className="task-contact-link contact-link-email" title="Click to copy email">
                      ✉️ {p.email}
                      {copied?.enrollmentId === task.enrollmentId && copied?.field === "email" && <span style={{ fontSize: 12, color: "var(--success)", marginLeft: 4 }}>✓</span>}
                    </button>
                  )}
                  {p.phone && (
                    <button onClick={(e) => copyContact(e, p.phone, task.enrollmentId, "phone")} className="task-contact-link contact-link-phone" title="Click to copy phone">
                      📞 {p.phone}
                      {copied?.enrollmentId === task.enrollmentId && copied?.field === "phone" && <span style={{ fontSize: 12, color: "var(--success)", marginLeft: 4 }}>✓</span>}
                    </button>
                  )}
                  {p.linkedin && <a href={normalizeLinkedIn(p.linkedin)} target="_blank" rel="noopener noreferrer" className="task-contact-link" style={{ background: "var(--border)", border: "1px solid var(--input-border)", color: "var(--text-sec)" }}>💼 LinkedIn</a>}
                </div>
              </div>
              <div className="task-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => onSelect(p.id)}>View</button>
                <button className="btn btn-success btn-sm" onClick={() => dispatch({ type: "COMPLETE_STEP", payload: { enrollmentId: task.enrollmentId, stepId: task.step.id } })}>Done</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
