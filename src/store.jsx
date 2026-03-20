import { createContext, useContext, useReducer, useEffect, useMemo, useState, useRef, useCallback } from "react";
import { get, set } from "idb-keyval";
import { supabase } from "./supabase";
import { DEFAULT_SEQUENCE, EMAIL_LINKEDIN_SEQUENCE } from "./constants";
import { nextId, todayStr, daysSinceLast, hoursSinceLast, isTerminalStatus } from "./utils";

const STORAGE_KEY_PREFIX = "outreach-os-data";
const LS_KEY = "outreach-os-data"; // used only for one-time migration from localStorage
const idbKey = (userId) => userId ? `${STORAGE_KEY_PREFIX}-${userId}` : `${STORAGE_KEY_PREFIX}-guest`;
const StoreContext = createContext(null);

/* ── Initial state ── */

const defaultState = {
  prospects: [],
  sequences: [DEFAULT_SEQUENCE, EMAIL_LINKEDIN_SEQUENCE],
  enrollments: [],
  dismissedReminders: [],
  lists: [],
  adminFlags: {}, // keyed by "userId:prospectId" — only populated for admin users
};

function mergeLoaded(parsed) {
  if (!Array.isArray(parsed?.prospects) || !Array.isArray(parsed?.sequences)) return null;
  // Always sync the default sequence definition from code
  const sequences = parsed.sequences.map((s) =>
    s.isDefault ? { ...s, steps: DEFAULT_SEQUENCE.steps, name: DEFAULT_SEQUENCE.name, description: DEFAULT_SEQUENCE.description }
    : s.isEmailLinkedIn ? { ...s, steps: EMAIL_LINKEDIN_SEQUENCE.steps, name: EMAIL_LINKEDIN_SEQUENCE.name, description: EMAIL_LINKEDIN_SEQUENCE.description }
    : s
  );
  const hasDefault = sequences.some((s) => s.isDefault);
  if (!hasDefault) sequences.unshift(DEFAULT_SEQUENCE);
  const hasEmailLinkedIn = sequences.some((s) => s.isEmailLinkedIn);
  if (!hasEmailLinkedIn) sequences.push(EMAIL_LINKEDIN_SEQUENCE);

  // Clean up enrollments: remove completedSteps that reference deleted step IDs
  const seqMap = new Map(sequences.map((s) => [s.id, new Set(s.steps.map((st) => st.id))]));
  const enrollments = (parsed.enrollments || []).map((en) => {
    const validIds = seqMap.get(en.sequenceId);
    if (!validIds) return en;
    const cleaned = en.completedSteps.filter((id) => validIds.has(id));
    return cleaned.length !== en.completedSteps.length ? { ...en, completedSteps: cleaned } : en;
  });

  return {
    ...defaultState,
    ...parsed,
    sequences,
    enrollments,
    lists: parsed.lists || [],
    adminFlags: parsed.adminFlags || {},
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
      const outreachType = action.payload.outreachType || "default";
      const prospect = {
        ...action.payload,
        id,
        createdAt: todayStr(),
        touchpoints: [],
        status: action.payload.status || "Not Started",
      };
      const out = { ...state, prospects: [...state.prospects, prospect] };
      const seq = outreachType === "email-linkedin"
        ? state.sequences.find((s) => s.isEmailLinkedIn)
        : state.sequences.find((s) => s.isDefault);
      if (seq) {
        out.enrollments = [
          ...state.enrollments,
          { id: nextId(), prospectId: id, sequenceId: seq.id, startDate: todayStr(), completedSteps: [] },
        ];
      }
      return out;
    }

    case "IMPORT_PROSPECTS": {
      const outreachType = action.meta?.outreachType || "default";
      const newP = action.payload.map((p) => ({
        ...p, id: nextId(), createdAt: todayStr(), touchpoints: [], status: p.status || "Not Started",
        ...(outreachType === "email-linkedin" ? { outreachType: "email-linkedin" } : {}),
      }));
      const seq = outreachType === "email-linkedin"
        ? state.sequences.find((s) => s.isEmailLinkedIn)
        : state.sequences.find((s) => s.isDefault);
      const newE = seq
        ? newP.map((p) => ({ id: nextId(), prospectId: p.id, sequenceId: seq.id, startDate: todayStr(), completedSteps: [] }))
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
      const { prospectId, touchpoint, newStatus, callback } = action.payload;
      const today = todayStr();

      /* ── 1. Update prospect touchpoints + auto-status rules ── */
      const updatedProspects = state.prospects.map((p) => {
        if (p.id !== prospectId) return p;
        const updatedTps = [...p.touchpoints, { ...touchpoint, id: nextId() }];

        // Start with the direct outcome the user selected
        // Activity-only outcomes (Sent, Connection Req Sent, Pending) don't change prospect status
        const ACTIVITY_ONLY = new Set(["Sent", "Connection Req Sent", "Pending"]);
        let autoStatus = ACTIVITY_ONLY.has(newStatus) ? p.status : (newStatus || p.status);

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

        // Rule C: Status protection — weak/routine outcomes cannot downgrade meaningful statuses.
        // e.g. a Call Back prospect who gets DNP/Busy should stay Call Back, not drop to DNP/Busy.
        const WEAK_OUTCOMES = new Set(["DNP/Busy", "No Response"]);
        const PROTECTED_STATUSES = new Set(["Call Back", "Connected +ve", "Replied", "Nurture", "Trials", "Meeting Booked", "Opportunity"]);
        if (WEAK_OUTCOMES.has(autoStatus) && PROTECTED_STATUSES.has(p.status)) {
          autoStatus = p.status;
        }

        // If Call Back outcome with scheduled callback, add to callbacks array
        if (callback) {
          const callbacks = [...(p.callbacks || []), { id: nextId(), date: callback.date, time: callback.time, note: callback.note || "", done: false }];
          return { ...p, touchpoints: updatedTps, status: autoStatus, callbacks };
        }

        return { ...p, touchpoints: updatedTps, status: autoStatus };
      });

      /* ── 2. Auto-advance: complete earliest matching pending sequence step ── */
      const updatedEnrollments = state.enrollments.map((en) => {
        if (en.prospectId !== prospectId) return en;
        const seq = state.sequences.find((s) => s.id === en.sequenceId);
        if (!seq) return en;

        // Use actualStartDate if the sequence has been resumed
        const hasResumed = en.actualStartDate && en.completedSteps.length > 0;
        let baseDate = en.startDate;
        let dayOffset = 0;
        if (hasResumed) {
          baseDate = en.actualStartDate;
          const firstCompletedStep = seq.steps.find((s) => s.id === en.completedSteps[0]);
          dayOffset = firstCompletedStep ? firstCompletedStep.day : 0;
        }

        // Check LinkedIn connection status for this prospect
        const prospectData = updatedProspects.find((p) => p.id === prospectId);
        const liAccepted = prospectData?.touchpoints.some((t) => t.channel === "LinkedIn" && t.status === "Accepted");

        // Find pending steps due today or earlier whose channel matches the logged touchpoint
        // LinkedIn steps with requiresLinkedInConnection that are swapped to Email also match Email touchpoints
        const matchingStep = seq.steps
          .filter((step) => {
            if (en.completedSteps.includes(step.id)) return false;
            const [y, m, d] = baseDate.split("-").map(Number);
            const due = new Date(y, m - 1, d);
            due.setDate(due.getDate() + (step.day - dayOffset));
            const dueStr = `${due.getFullYear()}-${String(due.getMonth()+1).padStart(2,"0")}-${String(due.getDate()).padStart(2,"0")}`;
            if (dueStr > today) return false;
            // Direct channel match
            if (step.channel === touchpoint.channel) return true;
            // Swapped LinkedIn → Email: if step requires LinkedIn connection but prospect not connected, match Email touchpoints
            if (step.requiresLinkedInConnection && !liAccepted && step.channel === "LinkedIn" && touchpoint.channel === "Email") return true;
            return false;
          })
          .sort((a, b) => a.day - b.day)[0]; // earliest pending step first

        if (!matchingStep) return en;
        const updated = { ...en, completedSteps: [...en.completedSteps, matchingStep.id] };
        // If this is the first step being completed, record today as actual start date
        if (en.completedSteps.length === 0) {
          updated.actualStartDate = today;
        }
        return updated;
      });

      return { ...state, prospects: updatedProspects, enrollments: updatedEnrollments };
    }

    case "EDIT_TOUCHPOINT": {
      const { prospectId, touchpointId, updates } = action.payload;
      return {
        ...state,
        prospects: state.prospects.map((p) =>
          p.id !== prospectId ? p : {
            ...p,
            touchpoints: p.touchpoints.map((t) =>
              t.id !== touchpointId ? t : { ...t, ...updates }
            ),
          }
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

    case "COMPLETE_STEP": {
      const today = todayStr();
      return {
        ...state,
        enrollments: state.enrollments.map((e) => {
          if (e.id !== action.payload.enrollmentId || e.completedSteps.includes(action.payload.stepId)) return e;
          const updated = { ...e, completedSteps: [...e.completedSteps, action.payload.stepId] };
          // If this is the first step being completed, record today as the actual start date
          // so that remaining steps resume relative to this date instead of the original enrollment date
          if (e.completedSteps.length === 0) {
            updated.actualStartDate = today;
          }
          return updated;
        }),
      };
    }

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

    case "COMPLETE_CALLBACK": {
      const { prospectId, callbackId } = action.payload;
      return {
        ...state,
        prospects: state.prospects.map((p) =>
          p.id !== prospectId ? p : { ...p, callbacks: (p.callbacks || []).map((cb) => cb.id === callbackId ? { ...cb, done: true } : cb) }
        ),
      };
    }

    case "DISMISS_REMINDER":
      return { ...state, dismissedReminders: [...state.dismissedReminders, action.payload] };

    case "DISMISS_ALL_REMINDERS":
      return { ...state, dismissedReminders: [...state.dismissedReminders, ...action.payload] };

    case "DELETE_LIST": {
      const { listName, deleteProspects } = action.payload;
      const removedIds = deleteProspects
        ? new Set(state.prospects.filter((p) => p.listName === listName).map((p) => p.id))
        : new Set();
      return {
        ...state,
        lists: state.lists.filter((l) => l.name !== listName),
        prospects: deleteProspects
          ? state.prospects.filter((p) => p.listName !== listName)
          : state.prospects.map((p) => p.listName === listName ? { ...p, listName: "" } : p),
        enrollments: deleteProspects
          ? state.enrollments.filter((e) => !removedIds.has(e.prospectId))
          : state.enrollments,
      };
    }

    case "TOGGLE_STAR": {
      const pid = action.payload;
      return {
        ...state,
        prospects: state.prospects.map((p) => p.id === pid ? { ...p, starred: !p.starred } : p),
      };
    }

    case "FLAG_PROSPECT": {
      const { key, note } = action.payload;
      return {
        ...state,
        adminFlags: { ...state.adminFlags, [key]: { note: note || "", flaggedAt: new Date().toISOString() } },
      };
    }

    case "UNFLAG_PROSPECT": {
      const flags = { ...state.adminFlags };
      delete flags[action.payload];
      return { ...state, adminFlags: flags };
    }

    case "RESET_DATA":
      return defaultState;

    case "SYNC_DEFAULT_SEQUENCE": {
      // Force-sync stored default sequence with code definition and clean all enrollments
      let sequences = state.sequences.map((s) =>
        s.isDefault ? { ...s, steps: DEFAULT_SEQUENCE.steps, name: DEFAULT_SEQUENCE.name, description: DEFAULT_SEQUENCE.description }
        : s.isEmailLinkedIn ? { ...s, steps: EMAIL_LINKEDIN_SEQUENCE.steps, name: EMAIL_LINKEDIN_SEQUENCE.name, description: EMAIL_LINKEDIN_SEQUENCE.description }
        : s
      );
      if (!sequences.some((s) => s.isEmailLinkedIn)) sequences = [...sequences, EMAIL_LINKEDIN_SEQUENCE];
      const seqMap = new Map(sequences.map((s) => [s.id, new Set(s.steps.map((st) => st.id))]));
      const enrollments = state.enrollments.map((en) => {
        const validIds = seqMap.get(en.sequenceId);
        if (!validIds) return en;
        const cleaned = en.completedSteps.filter((id) => validIds.has(id));
        return cleaned.length !== en.completedSteps.length ? { ...en, completedSteps: cleaned } : en;
      });
      return { ...state, sequences, enrollments };
    }

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
    const key = idbKey(userId);
    if (supabase && userId) {
      try {
        // Fetch both sources in parallel — pick whichever is newer
        const [cloudRes, idbData] = await Promise.all([
          supabase.from("user_data").select("data").eq("user_id", userId).single(),
          get(key).catch(() => null),
        ]);
        const cloudPayload = (!cloudRes.error && cloudRes.data?.data) ? cloudRes.data.data : null;
        const cloudValid = cloudPayload && mergeLoaded(cloudPayload);
        const idbValid = idbData && mergeLoaded(idbData);

        if (cloudValid && idbValid) {
          // Both exist — use the one saved more recently (_savedAt: 0 for legacy data without it)
          const best = (idbData._savedAt || 0) > (cloudPayload._savedAt || 0) ? idbData : cloudPayload;
          dispatch({ type: "HYDRATE", payload: best });
        } else if (cloudValid) {
          dispatch({ type: "HYDRATE", payload: cloudPayload });
        } else if (idbValid) {
          dispatch({ type: "HYDRATE", payload: idbData });
          await supabase.from("user_data").upsert({ user_id: userId, data: idbData, updated_at: new Date().toISOString() });
        }
        persistAllowed.current = true;
        setHydrated(true);
        return;
      } catch { /* network error — fall through to IndexedDB */ }
    }
    // No Supabase or not logged in — use user-scoped IndexedDB
    const idbData = await get(key).catch(() => null);
    if (idbData) {
      const merged = mergeLoaded(idbData);
      if (merged) dispatch({ type: "HYDRATE", payload: idbData });
    } else if (!userId) {
      // One-time migration from legacy unscoped localStorage (guest/old sessions only)
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          dispatch({ type: "HYDRATE", payload: parsed });
          set(key, parsed).then(() => localStorage.removeItem(LS_KEY));
        }
      } catch { /* corrupt — start fresh */ }
    }
    persistAllowed.current = true;
    setHydrated(true);
  }, []);

  /* ── After hydration, force-sync default sequence so edits propagate to all leads ── */
  useEffect(() => {
    if (hydrated) dispatch({ type: "SYNC_DEFAULT_SEQUENCE" });
  }, [hydrated]);

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
    const toSave = { ...state, _savedAt: Date.now() };
    // Always write to local IndexedDB immediately (offline cache), scoped per user
    set(idbKey(user?.id ?? null), toSave).catch(() => {});
    // Debounce cloud writes to avoid hammering Supabase on every keystroke
    if (supabase && user) {
      clearTimeout(saveTimer.current);
      setSyncing(true);
      saveTimer.current = setTimeout(async () => {
        await supabase
          .from("user_data")
          .upsert({ user_id: user.id, data: toSave, updated_at: new Date().toISOString() })
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
        body: JSON.stringify({ user_id: u.id, data: { ...latestState.current, _savedAt: Date.now() }, updated_at: new Date().toISOString() }),
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
      if (isTerminalStatus(prospect)) return;

      // If the prospect completed their first task late, use actualStartDate as the anchor.
      // All remaining step days are offset relative to the first completed step's day number.
      const hasResumed = en.actualStartDate && en.completedSteps.length > 0;
      let baseDate = en.startDate;
      let dayOffset = 0;
      if (hasResumed) {
        baseDate = en.actualStartDate;
        // Find the day number of the first step that was completed (the one that triggered resume)
        const firstCompletedStep = seq.steps.find((s) => s.id === en.completedSteps[0]);
        dayOffset = firstCompletedStep ? firstCompletedStep.day : 0;
      }

      // Check LinkedIn connection status for this prospect
      const linkedInAccepted = prospect.touchpoints.some((t) => t.channel === "LinkedIn" && t.status === "Accepted");

      seq.steps.forEach((step) => {
        if (en.completedSteps.includes(step.id)) return;
        const [sy, sm, sd] = baseDate.split("-").map(Number);
        const due = new Date(sy, sm - 1, sd); // local date — avoids UTC off-by-one
        due.setDate(due.getDate() + (step.day - dayOffset));
        const dueStr = `${due.getFullYear()}-${String(due.getMonth()+1).padStart(2,"0")}-${String(due.getDate()).padStart(2,"0")}`;
        if (dueStr <= today) {
          // LinkedIn follow-up steps require an accepted connection.
          // If not connected, swap to Email fallback so the rep still has an action.
          if (step.requiresLinkedInConnection && !linkedInAccepted) {
            const swapped = {
              ...step,
              channel: "Email",
              note: "LinkedIn not connected — send email or InMail instead",
              _swappedFromLinkedIn: true,
            };
            tasks.push({ prospect, seq, step: swapped, dueDate: dueStr, enrollmentId: en.id });
          } else {
            tasks.push({ prospect, seq, step, dueDate: dueStr, enrollmentId: en.id });
          }
        }
      });
    });

    // Add callback tasks (scheduled Call Backs)
    state.prospects.forEach((prospect) => {
      if (isTerminalStatus(prospect)) return;
      (prospect.callbacks || []).forEach((cb) => {
        if (cb.done) return;
        if (cb.date > today) return;
        tasks.push({
          prospect,
          seq: null,
          step: { id: `cb-${cb.id}`, channel: "Call", note: cb.note || "Scheduled call back", _isCallback: true },
          dueDate: cb.date,
          callbackId: cb.id,
          callbackTime: cb.time,
          enrollmentId: null,
        });
      });
    });

    return tasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [state.enrollments, state.sequences, state.prospects, today]);

  /* Derived: prospects untouched 28h+ */
  const overdueProspects = useMemo(
    () => state.prospects.filter((p) => {
      const h = hoursSinceLast(p);
      return h !== null && h >= 28 && !isTerminalStatus(p) && !state.dismissedReminders.includes(p.id);
    }),
    [state.prospects, state.dismissedReminders]
  );

  /* Derived: global stats */
  const stats = useMemo(() => {
    const t = state.prospects.length;
    const meetings = state.prospects.filter((p) => p.status === "Meeting Booked").length;
    const replyChannels = new Set(["Email", "LinkedIn"]);
    const contactedViaEL = state.prospects.filter((p) => p.touchpoints.some((tp) => replyChannels.has(tp.channel)));
    const replied = contactedViaEL.filter((p) => p.touchpoints.some((tp) => replyChannels.has(tp.channel) && (tp.status === "Replied" || tp.status === "Meeting Booked"))).length;
    const totalTp = state.prospects.reduce((a, p) => a + p.touchpoints.length, 0);
    const needsTouch3 = state.prospects.filter((p) => { if (isTerminalStatus(p)) return false; const d = daysSinceLast(p); return d !== null && d >= 3; }).length;
    const needsTouch7 = state.prospects.filter((p) => { if (isTerminalStatus(p)) return false; const d = daysSinceLast(p); return d !== null && d >= 7; }).length;
    const won = state.prospects.filter((p) => p.status === "Opportunity").length;
    return {
      total: t, meetings, replied, totalTp, won, needsTouch3, needsTouch7,
      replyRate: contactedViaEL.length ? Math.round((replied / contactedViaEL.length) * 100) : 0,
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
        .upsert({ user_id: latestUser.current.id, data: { ...latestState.current, _savedAt: Date.now() }, updated_at: new Date().toISOString() });
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
