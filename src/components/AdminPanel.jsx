import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { useStore } from "../store";

/* ── Duplicate detection ──────────────────────────────────────────────── */

function buildDuplicateKeys(allProspects) {
  // Returns a Set of "userId:prospectId" keys that are duplicates of another user's prospect
  const emailMap = {}; // normalizedEmail → [{ userId, prospectId }]
  const nameCoMap = {}; // "name|company" → [{ userId, prospectId }]

  allProspects.forEach(({ userId, prospect: p }) => {
    const ref = { userId, prospectId: p.id };
    if (p.email) {
      const key = p.email.trim().toLowerCase();
      if (!emailMap[key]) emailMap[key] = [];
      emailMap[key].push(ref);
    }
    if (p.name && p.company) {
      const key = `${p.name.trim().toLowerCase()}|${p.company.trim().toLowerCase()}`;
      if (!nameCoMap[key]) nameCoMap[key] = [];
      nameCoMap[key].push(ref);
    }
  });

  const dupKeys = new Set();
  const mark = (groups) => {
    Object.values(groups).forEach((refs) => {
      if (refs.length < 2) return;
      // Only flag cross-user duplicates
      const userIds = new Set(refs.map((r) => r.userId));
      if (userIds.size < 2) return;
      refs.forEach((r) => dupKeys.add(`${r.userId}:${r.prospectId}`));
    });
  };
  mark(emailMap);
  mark(nameCoMap);
  return dupKeys;
}

/* ── Main Component ───────────────────────────────────────────────────── */

export default function AdminPanel() {
  const { state, dispatch, user } = useStore();
  const [usersData, setUsersData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [filterDupes, setFilterDupes] = useState(false);
  const [expandedUsers, setExpandedUsers] = useState({});

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      setError(null);
      try {
        const session = await supabase?.auth.getSession();
        const token = session?.data?.session?.access_token;
        if (!token) throw new Error("Not authenticated");
        const res = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load admin data");
        setUsersData(body.users || []);
        // Auto-expand all
        const expanded = {};
        (body.users || []).forEach((u) => { expanded[u.userId] = true; });
        setExpandedUsers(expanded);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  const allProspects = useMemo(() => {
    if (!usersData) return [];
    return usersData.flatMap((u) => u.prospects.map((p) => ({ userId: u.userId, userEmail: u.userEmail, prospect: p })));
  }, [usersData]);

  const dupKeys = useMemo(() => buildDuplicateKeys(allProspects), [allProspects]);
  const adminFlags = state.adminFlags || {};

  const totalProspects = allProspects.length;
  const totalDupes = dupKeys.size;
  const totalFlagged = Object.keys(adminFlags).length;

  function toggleFlag(key, currentlyFlagged) {
    if (currentlyFlagged) {
      dispatch({ type: "UNFLAG_PROSPECT", payload: key });
    } else {
      dispatch({ type: "FLAG_PROSPECT", payload: { key, note: "Duplicate" } });
    }
  }

  function toggleUser(userId) {
    setExpandedUsers((prev) => ({ ...prev, [userId]: !prev[userId] }));
  }

  const lowerSearch = search.toLowerCase();

  function filterProspects(prospects) {
    return prospects.filter((p) => {
      const key = `${p._ownerId}:${p.id}`;
      const matchesSearch =
        !lowerSearch ||
        p.name?.toLowerCase().includes(lowerSearch) ||
        p.company?.toLowerCase().includes(lowerSearch) ||
        p.email?.toLowerCase().includes(lowerSearch);
      const matchesDupe = !filterDupes || dupKeys.has(key);
      return matchesSearch && matchesDupe;
    });
  }

  if (loading) {
    return (
      <div style={{ padding: 32, color: "var(--text-muted)", textAlign: "center" }}>
        Loading all prospects…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32 }}>
        <div style={{ background: "#2a1e1e", border: "1px solid #991b1b", borderRadius: 8, padding: "12px 16px", color: "#f87171" }}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>Admin Panel</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          All users' prospects — you are signed in as <strong>{user?.email}</strong>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Total Prospects", value: totalProspects },
          { label: "Users", value: usersData?.length || 0 },
          { label: "Cross-User Duplicates", value: totalDupes, color: totalDupes > 0 ? "#f59e0b" : undefined },
          { label: "Flagged", value: totalFlagged, color: totalFlagged > 0 ? "#ef4444" : undefined },
        ].map((c) => (
          <div key={c.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 20px", minWidth: 140 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: c.color || "var(--text)" }}>{c.value}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <input
          className="form-input"
          placeholder="Search name, company, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 260 }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-sec)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={filterDupes}
            onChange={(e) => setFilterDupes(e.target.checked)}
            style={{ accentColor: "var(--primary)" }}
          />
          Show duplicates only
        </label>
      </div>

      {/* Per-user sections */}
      {(usersData || []).map((u) => {
        const filtered = filterProspects(u.prospects);
        if (filtered.length === 0 && (lowerSearch || filterDupes)) return null;
        const isExpanded = expandedUsers[u.userId];

        return (
          <div key={u.userId} style={{ marginBottom: 20, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            {/* User header */}
            <button
              onClick={() => toggleUser(u.userId)}
              style={{
                width: "100%", background: "var(--surface-raised)", border: "none", padding: "12px 16px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                cursor: "pointer", color: "var(--text)", fontFamily: "var(--font)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{u.userEmail}</span>
                <span style={{ fontSize: 12, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "1px 8px", color: "var(--text-muted)" }}>
                  {u.prospects.length} prospect{u.prospects.length !== 1 ? "s" : ""}
                </span>
                {u.prospects.some((p) => dupKeys.has(`${u.userId}:${p.id}`)) && (
                  <span style={{ fontSize: 11, background: "#451a03", border: "1px solid #92400e", borderRadius: 20, padding: "1px 8px", color: "#fbbf24" }}>
                    has duplicates
                  </span>
                )}
              </div>
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{isExpanded ? "▲" : "▼"}</span>
            </button>

            {/* Prospect table */}
            {isExpanded && (
              <div style={{ overflowX: "auto" }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: "16px", fontSize: 13, color: "var(--text-muted)" }}>No prospects match the filter.</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
                        {["Name", "Company", "Email", "Status", "Touchpoints", "Tags", "Actions"].map((h) => (
                          <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--text-sec)", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((p) => {
                        const key = `${u.userId}:${p.id}`;
                        const isDupe = dupKeys.has(key);
                        const isFlagged = !!adminFlags[key];
                        return (
                          <tr
                            key={key}
                            style={{
                              borderBottom: "1px solid var(--border)",
                              background: isFlagged ? "rgba(239,68,68,0.06)" : isDupe ? "rgba(245,158,11,0.06)" : undefined,
                            }}
                          >
                            <td style={{ padding: "8px 12px", fontWeight: 600, color: "var(--text)" }}>{p.name}</td>
                            <td style={{ padding: "8px 12px", color: "var(--text-sec)" }}>{p.company || "—"}</td>
                            <td style={{ padding: "8px 12px", color: "var(--text-muted)", fontFamily: "monospace", fontSize: 12 }}>{p.email || "—"}</td>
                            <td style={{ padding: "8px 12px" }}>
                              <span style={{ fontSize: 11, borderRadius: 20, padding: "2px 8px", background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
                                {p.status}
                              </span>
                            </td>
                            <td style={{ padding: "8px 12px", color: "var(--text-muted)", textAlign: "center" }}>{p.touchpoints?.length ?? 0}</td>
                            <td style={{ padding: "8px 12px" }}>
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                {isDupe && (
                                  <span style={{ fontSize: 11, borderRadius: 20, padding: "2px 8px", background: "#451a03", border: "1px solid #92400e", color: "#fbbf24" }}>
                                    duplicate
                                  </span>
                                )}
                                {isFlagged && (
                                  <span style={{ fontSize: 11, borderRadius: 20, padding: "2px 8px", background: "#450a0a", border: "1px solid #7f1d1d", color: "#fca5a5" }}>
                                    flagged
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: "8px 12px" }}>
                              <button
                                onClick={() => toggleFlag(key, isFlagged)}
                                style={{
                                  fontSize: 12, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
                                  border: `1px solid ${isFlagged ? "#7f1d1d" : "var(--border)"}`,
                                  background: isFlagged ? "#450a0a" : "var(--surface-raised)",
                                  color: isFlagged ? "#fca5a5" : "var(--text-sec)",
                                  fontFamily: "var(--font)",
                                }}
                              >
                                {isFlagged ? "Unflag" : "Flag"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
