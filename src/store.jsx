import { createContext, useContext, useReducer, useEffect, useMemo } from "react";
import { DEFAULT_SEQUENCE, SEED_PROSPECTS } from "./constants";
import { nextId, todayStr, daysSinceLast, hoursSinceLast } from "./utils";

const STORAGE_KEY = "outreach-os-data";
const StoreContext = createContext(null);

/* ── Initial state ── */

const defaultState = {
  prospects: SEED_PROSPECTS,
  sequences: [DEFAULT_SEQUENCE],
  enrollments: [],
  dismissedReminders: [],
  lists: [],
  users: [],          // { id, name }
  currentUserId: null,
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.prospects) && Array.isArray(parsed.sequences))
      return { ...defaultState, ...parsed, lists: parsed.lists || [], users: parsed.users || [], currentUserId: parsed.currentUserId || null };
  } catch { /* corrupt data — reset */ }
  return defaultState;
}

/* ── Duplicate detection ── */

export function findDuplicate(existingProspects, newProspect) {
  const email = (newProspect.email || "").trim().toLowerCase();
  const name = (newProspect.name || "").trim().toLowerCase();
  const company = (newProspect.company || "").trim().toLowerCase();
  for (const p of existingProspects) {
    if (p.isDuplicate) continue; // only match against originals
    if (email && p.email && p.email.trim().toLowerCase() === email) return p;
    if (name && company && p.name.trim().toLowerCase() === name && p.company.trim().toLowerCase() === company) return p;
  }
  return null;
}

/* ── Reducer ── */

function reducer(state, action) {
  switch (action.type) {

    case "ADD_USER": {
      const newUser = { id: `user_${Date.now()}`, name: action.payload.trim() };
      return { ...state, users: [...state.users, newUser], currentUserId: newUser.id };
    }

    case "SET_CURRENT_USER":
      return { ...state, currentUserId: action.payload };

    case "ADD_PROSPECT": {
      const id = nextId();
      const existing = findDuplicate(state.prospects, action.payload);
      const prospect = {
        ...action.payload,
        id,
        createdAt: todayStr(),
        touchpoints: [],
        status: action.payload.status || "Not Started",
        uploadedBy: state.currentUserId || null,
        ...(existing ? { isDuplicate: true, duplicateOfId: existing.id } : {}),
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
      const allExisting = [...state.prospects];
      const newP = action.payload.map((p) => {
        const existing = findDuplicate(allExisting, p);
        const newProspect = {
          ...p,
          id: nextId(),
          createdAt: todayStr(),
          touchpoints: [],
          status: "Not Started",
          uploadedBy: state.currentUserId || null,
          ...(existing ? { isDuplicate: true, duplicateOfId: existing.id } : {}),
        };
        allExisting.push(newProspect); // first in batch wins for subsequent rows
        return newProspect;
      });
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
          updatedLists = [...existingLists, { id: nextId(), name: listName, count: newP.length, uploadedAt: todayStr() }];
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

    case "DELETE_SEQUENCE":
      return {
        ...state,
        sequences: state.sequences.filter((s) => s.id !== action.payload),
        enrollments: state.enrollments.filter((e) => e.sequenceId !== action.payload),
      };

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

  /* Current user object */
  const currentUser = useMemo(
    () => state.users.find((u) => u.id === state.currentUserId) || null,
    [state.users, state.currentUserId]
  );

  /* Prospects visible to the current user: their own uploads + legacy (no uploadedBy) */
  const myProspects = useMemo(
    () => state.currentUserId
      ? state.prospects.filter((p) => !p.uploadedBy || p.uploadedBy === state.currentUserId)
      : state.prospects,
    [state.prospects, state.currentUserId]
  );

  /* Derived: tasks due today / overdue — scoped to current user */
  const tasksToday = useMemo(() => {
    const tasks = [];
    const myIds = new Set(myProspects.map((p) => p.id));
    state.enrollments.forEach((en) => {
      if (!myIds.has(en.prospectId)) return;
      const seq = state.sequences.find((s) => s.id === en.sequenceId);
      const prospect = myProspects.find((p) => p.id === en.prospectId);
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
  }, [state.enrollments, state.sequences, myProspects, today]);

  /* Derived: prospects untouched 28h+ — scoped to current user */
  const overdueProspects = useMemo(
    () => myProspects.filter((p) => {
      const h = hoursSinceLast(p);
      return h !== null && h >= 28 && !state.dismissedReminders.includes(p.id);
    }),
    [myProspects, state.dismissedReminders]
  );

  /* Derived: stats — scoped to current user */
  const stats = useMemo(() => {
    const t = myProspects.length;
    const meetings = myProspects.filter((p) => p.status === "Meeting Booked").length;
    const replied = myProspects.filter((p) => ["Replied", "Meeting Booked"].includes(p.status)).length;
    const totalTp = myProspects.reduce((a, p) => a + p.touchpoints.length, 0);
    const needsTouch7 = myProspects.filter((p) => { const d = daysSinceLast(p); return d !== null && d >= 7; }).length;
    const won = myProspects.filter((p) => p.status === "Closed Won").length;
    return {
      total: t, meetings, replied, totalTp, won, needsTouch7,
      replyRate: t ? Math.round((replied / t) * 100) : 0,
      winRate: t ? Math.round((won / t) * 100) : 0,
    };
  }, [myProspects]);

  /* Derived: list names — scoped to current user */
  const allLists = useMemo(
    () => [...new Set(myProspects.map((p) => p.listName).filter(Boolean))].sort(),
    [myProspects]
  );

  const value = useMemo(
    () => ({ state, dispatch, tasksToday, overdueProspects, stats, allLists, currentUser, myProspects }),
    [state, tasksToday, overdueProspects, stats, allLists, currentUser, myProspects]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
