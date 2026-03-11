import { createContext, useContext, useReducer, useEffect, useMemo } from "react";
import { DEFAULT_SEQUENCE } from "./constants";
import { nextId, todayStr, daysSinceLast, hoursSinceLast } from "./utils";

const STORAGE_KEY = "outreach-os-data";
const StoreContext = createContext(null);

/* ── Initial state ── */

const defaultState = {
  prospects: [],
  sequences: [DEFAULT_SEQUENCE],
  enrollments: [],
  dismissedReminders: [],
  lists: [],
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.prospects) && Array.isArray(parsed.sequences)) {
      const sequences = parsed.sequences;
      // Always ensure the default sequence is present
      const hasDefault = sequences.some((s) => s.isDefault);
      return {
        ...defaultState,
        ...parsed,
        sequences: hasDefault ? sequences : [DEFAULT_SEQUENCE, ...sequences],
        lists: parsed.lists || [],
      };
    }
  } catch { /* corrupt data — reset */ }
  return defaultState;
}

/* ── Reducer ── */

function reducer(state, action) {
  switch (action.type) {

    case "ADD_PROSPECT": {
      const id = nextId();
      const prospect = {
        ...action.payload,
        id,
        createdAt: todayStr(),
        touchpoints: [],
        status: action.payload.status || "Not Started",
      };
      const out = { ...state, prospects: [...state.prospects, prospect] };
      const defaultSeq = state.sequences.find((s) => s.isDefault);
      if (defaultSeq) {
        out.enrollments = [
          ...state.enrollments,
          { id: nextId(), prospectId: id, sequenceId: defaultSeq.id, startDate: todayStr(), completedSteps: [] },
        ];
      }
      return out;
    }

    case "IMPORT_PROSPECTS": {
      const newP = action.payload.map((p) => ({ ...p, id: nextId(), createdAt: todayStr(), touchpoints: [], status: p.status || "Not Started" }));
      const defaultSeq = state.sequences.find((s) => s.isDefault);
      const newE = defaultSeq
        ? newP.map((p) => ({ id: nextId(), prospectId: p.id, sequenceId: defaultSeq.id, startDate: todayStr(), completedSteps: [] }))
        : [];
      // Record list metadata
      const listName = action.meta?.listName;
      const existingLists = state.lists || [];
      let updatedLists = existingLists;
      if (listName) {
        const existingIdx = existingLists.findIndex((l) => l.name === listName);
        if (existingIdx >= 0) {
          updatedLists = existingLists.map((l, i) =>
            i === existingIdx ? { ...l, count: l.count + newP.length, updatedAt: todayStr() } : l
          );
        } else {
          updatedLists = [...existingLists, { id: nextId(), name: listName, count: newP.length, uploadedAt: todayStr(), updatedAt: todayStr() }];
        }
      }
      return { ...state, prospects: [...state.prospects, ...newP], enrollments: [...state.enrollments, ...newE], lists: updatedLists };
    }

    case "UPDATE_PROSPECT":
      return {
        ...state,
        prospects: state.prospects.map((p) => (p.id === action.payload.id ? { ...p, ...action.payload.updates } : p)),
      };

    case "DELETE_PROSPECT":
      return {
        ...state,
        prospects: state.prospects.filter((p) => p.id !== action.payload),
        enrollments: state.enrollments.filter((e) => e.prospectId !== action.payload),
      };

    case "DELETE_PROSPECTS": {
      const ids = new Set(action.payload);
      return {
        ...state,
        prospects: state.prospects.filter((p) => !ids.has(p.id)),
        enrollments: state.enrollments.filter((e) => !ids.has(e.prospectId)),
      };
    }

    case "ADD_TOUCHPOINT": {
      const { prospectId, touchpoint, newStatus } = action.payload;
      return {
        ...state,
        prospects: state.prospects.map((p) =>
          p.id === prospectId
            ? { ...p, touchpoints: [...p.touchpoints, { ...touchpoint, id: nextId() }], status: newStatus || p.status }
            : p
        ),
      };
    }

    case "DELETE_TOUCHPOINT":
      return {
        ...state,
        prospects: state.prospects.map((p) =>
          p.id === action.payload.prospectId
            ? { ...p, touchpoints: p.touchpoints.filter((t) => t.id !== action.payload.touchpointId) }
            : p
        ),
      };

    case "ADD_SEQUENCE":
      return { ...state, sequences: [...state.sequences, { ...action.payload, id: nextId() }] };

    case "UPDATE_SEQUENCE":
      return {
        ...state,
        sequences: state.sequences.map((s) => (s.id === action.payload.id ? { ...s, ...action.payload.updates } : s)),
      };

    case "DELETE_SEQUENCE": {
      const target = state.sequences.find((s) => s.id === action.payload);
      if (target?.isDefault) return state; // default cadence is permanent
      return {
        ...state,
        sequences: state.sequences.filter((s) => s.id !== action.payload),
        enrollments: state.enrollments.filter((e) => e.sequenceId !== action.payload),
      };
    }

    case "ENROLL_PROSPECT":
      return {
        ...state,
        enrollments: [
          ...state.enrollments,
          { id: nextId(), prospectId: action.payload.prospectId, sequenceId: action.payload.sequenceId, startDate: todayStr(), completedSteps: [] },
        ],
      };

    case "COMPLETE_STEP":
      return {
        ...state,
        enrollments: state.enrollments.map((e) =>
          e.id === action.payload.enrollmentId
            ? { ...e, completedSteps: [...e.completedSteps, action.payload.stepId] }
            : e
        ),
      };

    case "COMPLETE_ALL_FOR_PROSPECTS": {
      const ids = new Set(action.payload);
      return {
        ...state,
        enrollments: state.enrollments.map((e) => {
          if (!ids.has(e.prospectId)) return e;
          const seq = state.sequences.find((s) => s.id === e.sequenceId);
          return seq ? { ...e, completedSteps: seq.steps.map((s) => s.id) } : e;
        }),
      };
    }

    case "DISMISS_REMINDER":
      return { ...state, dismissedReminders: [...state.dismissedReminders, action.payload] };

    case "DISMISS_ALL_REMINDERS":
      return { ...state, dismissedReminders: [...state.dismissedReminders, ...action.payload] };

    case "RESET_DATA":
      return defaultState;

    default:
      return state;
  }
}

/* ── Provider ── */

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, loadState);

  /* Persist on every change */
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* quota exceeded */ }
  }, [state]);

  const today = todayStr();

  /* Derived: tasks due today / overdue */
  const tasksToday = useMemo(() => {
    const tasks = [];
    state.enrollments.forEach((en) => {
      const seq = state.sequences.find((s) => s.id === en.sequenceId);
      const prospect = state.prospects.find((p) => p.id === en.prospectId);
      if (!seq || !prospect) return;
      seq.steps.forEach((step) => {
        if (en.completedSteps.includes(step.id)) return;
        const due = new Date(en.startDate);
        due.setDate(due.getDate() + step.day);
        const dueStr = due.toISOString().slice(0, 10);
        if (dueStr <= today) {
          tasks.push({ prospect, seq, step, dueDate: dueStr, enrollmentId: en.id });
        }
      });
    });
    return tasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [state.enrollments, state.sequences, state.prospects, today]);

  /* Derived: prospects untouched 28h+ */
  const overdueProspects = useMemo(
    () => state.prospects.filter((p) => {
      const h = hoursSinceLast(p);
      return h !== null && h >= 28 && !state.dismissedReminders.includes(p.id);
    }),
    [state.prospects, state.dismissedReminders]
  );

  /* Derived: global stats */
  const stats = useMemo(() => {
    const t = state.prospects.length;
    const meetings = state.prospects.filter((p) => p.status === "Meeting Booked").length;
    const replied = state.prospects.filter((p) => ["Replied", "Meeting Booked"].includes(p.status)).length;
    const totalTp = state.prospects.reduce((a, p) => a + p.touchpoints.length, 0);
    const needsTouch7 = state.prospects.filter((p) => { const d = daysSinceLast(p); return d !== null && d >= 7; }).length;
    const won = state.prospects.filter((p) => p.status === "Opportunity").length;
    return {
      total: t, meetings, replied, totalTp, won, needsTouch7,
      replyRate: t ? Math.round((replied / t) * 100) : 0,
      winRate: t ? Math.round((won / t) * 100) : 0,
    };
  }, [state.prospects]);

  /* Derived: list names */
  const allLists = useMemo(
    () => [...new Set(state.prospects.map((p) => p.listName).filter(Boolean))].sort(),
    [state.prospects]
  );

  const value = useMemo(
    () => ({ state, dispatch, tasksToday, overdueProspects, stats, allLists }),
    [state, tasksToday, overdueProspects, stats, allLists]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
