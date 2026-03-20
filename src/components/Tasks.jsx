import { useState, useMemo, useCallback } from "react";
import { useStore } from "../store";
import { CHANNELS, CHANNEL_ICONS, CHANNEL_OUTCOMES } from "../constants";
import { todayStr, nowTimeStr, normalizeLinkedIn } from "../utils";
import { Badge } from "./ui";

export default function Tasks({ onSelect, onNavigate }) {
  const { tasksToday, dispatch } = useStore();
  const today = todayStr();
  const [copied, setCopied] = useState(null);

  /* ── Complete-task form state ── */
  // completingKey tracks which task row has the form open
  const [completingKey, setCompletingKey] = useState(null);
  const [completeNote, setCompleteNote] = useState("");
  const [completeOutcome, setCompleteOutcome] = useState("");

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
    if (!window.confirm(`Complete all ${filteredTasks.length} visible tasks? Each will be logged as a touchpoint.`)) return;
    const now = nowTimeStr();
    filteredTasks.forEach((t) => {
      const ch = t.step.channel;
      const outcomes = CHANNEL_OUTCOMES[ch] || [];
      const outcome = outcomes[0] || "";
      const tp = { channel: ch, date: today, time: now, note: "", status: outcome };
      dispatch({ type: "ADD_TOUCHPOINT", payload: { prospectId: t.prospect.id, touchpoint: tp, newStatus: outcome } });
      if (t.step._isCallback) {
        dispatch({ type: "COMPLETE_CALLBACK", payload: { prospectId: t.prospect.id, callbackId: t.callbackId } });
      }
    });
  }, [filteredTasks, dispatch, today]);

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
          const stepIdx = task.seq ? task.seq.steps.findIndex((s) => s.id === task.step.id) : -1;
          const p = task.prospect;
          const taskKey = `${task.enrollmentId}-${task.step.id}`;
          return (
            <div key={taskKey} className={`task-row${isOverdue ? " overdue" : ""}`} style={{ cursor: "pointer" }} onClick={() => onSelect(p.id)}>
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
                  {task.step._isCallback ? (
                    <>
                      <span style={{ color: "#fbbf24", fontWeight: 600 }}>Scheduled Call Back</span>
                      {task.callbackTime && <><span style={{ color: "var(--text-dim)", margin: "0 6px" }}>·</span><span className="mono" style={{ color: "#fbbf24" }}>at {task.callbackTime}</span></>}
                    </>
                  ) : (
                    <>Step {stepIdx + 1} of {task.seq.steps.length} in <span style={{ color: "var(--primary)" }}>{task.seq.name}</span></>
                  )}
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
              <div className="task-actions" onClick={(e) => e.stopPropagation()}>
                {completingKey === taskKey ? (
                  <button className="btn btn-ghost btn-sm" onClick={() => setCompletingKey(null)}>Cancel</button>
                ) : (
                  <button className="btn btn-success btn-sm" onClick={() => {
                    const ch = task.step.channel;
                    const outcomes = CHANNEL_OUTCOMES[ch] || [];
                    setCompletingKey(taskKey);
                    setCompleteNote("");
                    setCompleteOutcome(outcomes[0] || "");
                  }}>Done</button>
                )}
              </div>
              {/* Inline completion form */}
              {completingKey === taskKey && (() => {
                const ch = task.step.channel;
                const outcomes = CHANNEL_OUTCOMES[ch] || [];
                return (
                  <div onClick={(e) => e.stopPropagation()} style={{ gridColumn: "1 / -1", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", marginTop: 6 }}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                      <div style={{ flex: "0 0 auto" }}>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Outcome</div>
                        <select
                          className="form-select"
                          value={completeOutcome}
                          onChange={(e) => setCompleteOutcome(e.target.value)}
                          style={{ marginBottom: 0, fontSize: 13, minWidth: 160, padding: "5px 8px", borderRadius: 6 }}
                        >
                          {outcomes.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Note</div>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="What happened? Key takeaways…"
                          value={completeNote}
                          onChange={(e) => setCompleteNote(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") e.target.closest("div[style]").querySelector("button.btn-success")?.click(); }}
                          style={{ marginBottom: 0, fontSize: 13, padding: "5px 10px", borderRadius: 6 }}
                          autoFocus
                        />
                      </div>
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => {
                          const tp = { channel: ch, date: today, time: nowTimeStr(), note: completeNote.trim(), status: completeOutcome };
                          dispatch({ type: "ADD_TOUCHPOINT", payload: { prospectId: p.id, touchpoint: tp, newStatus: completeOutcome } });
                          if (task.step._isCallback) {
                            dispatch({ type: "COMPLETE_CALLBACK", payload: { prospectId: p.id, callbackId: task.callbackId } });
                          }
                          setCompletingKey(null);
                        }}
                      >
                        Complete
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
