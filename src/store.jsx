import { createContext, useContext, useReducer, useEffect, useMemo, useState, useRef, useCallback } from "react";
import { get, set } from "idb-keyval";
import { supabase } from "./supabase";
import { DEFAULT_SEQUENCE } from "./constants";
import { nextId, todayStr, daysSinceLast, hoursSinceLast } from "./utils";

const STORAGE_KEY = "outreach-os-data";
const LS_KEY = "outreach-os-data"; // same key — used only for one-time migration
const StoreContext = createContext(null);

/* ── Initial state ── */

const defaultState = {
  prospects: [],
  sequences: [DEFAULT_SEQUENCE],
  enrollments: [],
  dismissedReminders: [],
  lists: [],
};

function mergeLoaded(parsed) {
  if (!Array.isArray(parsed?.prospects) || !Array.isArray(parsed?.sequences)) return null;
  const sequences = parsed.sequences;
  const hasDefault = sequences.some((s) => s.isDefault);
  return {
    ...defaultState,
    ...parsed,
    sequences: hasDefault ? sequences : [DEFAULT_SEQUENCE, ...sequences],
    lists: parsed.lists || [],
  };
}

/* ── Reducer ── */

function reducer(state, action) {
  switch (action.type) {

    case "HYDRATE": {
      const merged = mergeLoaded(action.payload);
      return merged || state;
    }

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
      const today = todayStr();

      /* ── 1. Update prospect touchpoints + auto-status rules ── */
      const updatedProspects = state.prospects.map((p) => {
        if (p.id !== prospectId) return p;
        const updatedTps = [...p.touchpoints, { ...touchpoint, id: nextId() }];

        // Start with the direct outcome the user selected
        let autoStatus = newStatus || p.status;

        // Rule A: 3 consecutive DNP/Busy calls → move to Nurture
        if (touchpoint.channel === "Call") {
          const callTps = updatedTps.filter((t) => t.channel === "Call");
          if (callTps.length >= 3 && callTps.slice(-3).every((t) => t.status === "DNP/Busy")) {
            autoStatus = "Nurture";
          }
        }

        // Rule B: Connected +ve → Call Back (positive convo, schedule follow-up)
        if (touchpoint.status === "Connected +ve") {
          autoStatus = "Call Back";
        }

        return { ...p, touchpoints: updatedTps, status: autoStatus };
      });

      /* ── 2. Auto-advance: complete earliest matching pending sequence step ── */
      const updatedEnrollments = state.enrollments.map((en) => {
        if (en.prospectId !== prospectId) return en;
        const seq = state.sequences.find((s) => s.id === en.sequenceId);
        if (!seq) return en;

        // Find pending steps due today or earlier whose channel matches the logged touchpoint
        const matchingStep = seq.steps
          .filter((step) => {
            if (en.completedSteps.includes(step.id)) return false;
            const [y, m, d] = en.startDate.split("-").map(Number);
            const due = new Date(y, m - 1, d);
            due.setDate(due.getDate() + step.day);
            return due.toISOString().slice(0, 10) <= today && step.channel === touchpoint.channel;
          })
          .sort((a, b) => a.day - b.day)[0]; // earliest pending step first

        if (!matchingStep) return en;
        return { ...en, completedSteps: [...en.completedSteps, matchingStep.id] };
      });

      return { ...state, prospects: updatedProspects, enrollments: updatedEnrollments };
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
  const [state, dispatch] = useReducer(reducer, defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState(null);   // Supabase auth user (null = not logged in)
  const [syncing, setSyncing] = useState(false); // cloud save in progress
  const persistAllowed = useRef(false);
  const saveTimer = useRef(null);
  const loadedForUser = useRef(undefined); // tracks which userId we've already loaded data for
  const latestToken = useRef(null);         // user's JWT access token for keepalive flush

  /* ── Load data for a given userId from Supabase, fall back to IndexedDB ── */
  const loadData = useCallback(async (userId) => {
    persistAllowed.current = false;
    if (supabase && userId) {
      try {
        const { data, error } = await supabase
          .from("user_data")
          .select("data")
          .eq("user_id", userId)
          .single();
        if (!error && data?.data) {
          const merged = mergeLoaded(data.data);
          if (merged) {
            dispatch({ type: "HYDRATE", payload: data.data });
            persistAllowed.current = true;
            setHydrated(true);
            return;
          }
        }
        // No cloud data yet — check if there's local data to migrate up
        const idbData = await get(STORAGE_KEY).catch(() => null);
        if (idbData && mergeLoaded(idbData)) {
          dispatch({ type: "HYDRATE", payload: idbData });
          // Auto-migrate local data to the cloud
          await supabase.from("user_data").upsert({ user_id: userId, data: idbData, updated_at: new Date().toISOString() });
        }
        persistAllowed.current = true;
        setHydrated(true);
        return;
      } catch { /* network error — fall through to IndexedDB */ }
    }
    // No Supabase or not logged in — use local IndexedDB only
    const idbData = await get(STORAGE_KEY).catch(() => null);
    if (idbData) {
      const merged = mergeLoaded(idbData);
      if (merged) dispatch({ type: "HYDRATE", payload: idbData });
    } else {
      // One-time migration from localStorage
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          dispatch({ type: "HYDRATE", payload: parsed });
          set(STORAGE_KEY, parsed).then(() => localStorage.removeItem(LS_KEY));
        }
      } catch { /* corrupt — start fresh */ }
    }
    persistAllowed.current = true;
    setHydrated(true);
  }, []);

  /* ── Auth: check session on mount, listen for changes ── */
  useEffect(() => {
    if (!supabase) {
      loadData(null);
      return;
    }
    // Use onAuthStateChange exclusively. Supabase v2 fires both INITIAL_SESSION
    // and SIGNED_IN when restoring an existing session — loadedForUser guards
    // against calling loadData twice for the same user.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      const uid = u?.id ?? null;

      // Always keep the latest access token fresh (TOKEN_REFRESHED rotates it)
      latestToken.current = session?.access_token ?? null;

      if (event === "SIGNED_OUT") {
        loadedForUser.current = undefined;
        latestToken.current = null;
        setUser(null);
        dispatch({ type: "RESET_DATA" });
        persistAllowed.current = false;
        setHydrated(true);
        return;
      }

      // For INITIAL_SESSION and SIGNED_IN: only load data when the user changes
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
        setUser(u);
        if (uid !== loadedForUser.current) {
          loadedForUser.current = uid;
          loadData(uid);
        }
        return;
      }

      // TOKEN_REFRESHED, USER_UPDATED — update user object only, never reload data
      if (u) setUser(u);
    });
    return () => subscription.unsubscribe();
  }, [loadData]);

  /* ── Persist on every state change ── */
  // Keep a ref to latest state+user so the beforeunload handler can flush
  const latestState = useRef(state);
  const latestUser = useRef(user);
  useEffect(() => { latestState.current = state; }, [state]);
  useEffect(() => { latestUser.current = user; }, [user]);

  useEffect(() => {
    if (!hydrated || !persistAllowed.current) return;
    // Always write to local IndexedDB immediately (offline cache)
    set(STORAGE_KEY, state).catch(() => {});
    // Debounce cloud writes to avoid hammering Supabase on every keystroke
    if (supabase && user) {
      clearTimeout(saveTimer.current);
      setSyncing(true);
      saveTimer.current = setTimeout(async () => {
        await supabase
          .from("user_data")
          .upsert({ user_id: user.id, data: state, updated_at: new Date().toISOString() })
          .catch(() => {});
        setSyncing(false);
      }, 300);
    }
  }, [state, hydrated, user]);

  /* Flush any pending Supabase save immediately before page closes.
     Uses fetch keepalive:true so the request completes even after unload. */
  useEffect(() => {
    if (!supabase) return;
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    function flush() {
      const u = latestUser.current;
      if (!u || !persistAllowed.current) return;
      clearTimeout(saveTimer.current);
      const token = latestToken.current || key; // prefer user JWT; fall back to anon key
      fetch(`${url}/rest/v1/user_data?on_conflict=user_id`, {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "apikey": key,
          "Prefer": "resolution=merge-duplicates",
        },
        body: JSON.stringify({ user_id: u.id, data: latestState.current, updated_at: new Date().toISOString() }),
      }).catch(() => {});
    }
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);

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
        const [sy, sm, sd] = en.startDate.split("-").map(Number);
        const due = new Date(sy, sm - 1, sd); // local date — avoids UTC off-by-one
        due.setDate(due.getDate() + step.day);
        const dueStr = `${due.getFullYear()}-${String(due.getMonth()+1).padStart(2,"0")}-${String(due.getDate()).padStart(2,"0")}`;
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

  /* Flush any pending debounced save immediately (call before sign-out) */
  const flushSave = useCallback(async () => {
    if (!supabase || !latestUser.current || !persistAllowed.current) return;
    clearTimeout(saveTimer.current);
    try {
      await supabase
        .from("user_data")
        .upsert({ user_id: latestUser.current.id, data: latestState.current, updated_at: new Date().toISOString() });
    } catch { /* ignore */ }
  }, []);

  /* Backup helpers exposed to UI */
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({ ...state, _exportedAt: new Date().toISOString(), _version: 1 }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `outreachos-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        const merged = mergeLoaded(parsed);
        if (!merged) { reject(new Error("Invalid backup file — missing required data.")); return; }
        dispatch({ type: "HYDRATE", payload: parsed });
        resolve(merged.prospects.length);
      } catch (err) {
        reject(new Error("Could not parse backup file."));
      }
    };
    reader.readAsText(file);
  });

  const value = useMemo(
    () => ({ state, dispatch, tasksToday, overdueProspects, stats, allLists, hydrated, user, syncing, exportBackup, importBackup, flushSave }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, tasksToday, overdueProspects, stats, allLists, hydrated, user, syncing, flushSave]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
