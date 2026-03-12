import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { useStore } from "../store";

/* ── Duplicate detection ── */
function buildDuplicateKeys(allProspects) {
  const emailMap = {}, nameCoMap = {};
  allProspects.forEach(({ userId, prospect: p }) => {
    const ref = { userId, prospectId: p.id };
    if (p.email) { const k = p.email.trim().toLowerCase(); if (!emailMap[k]) emailMap[k] = []; emailMap[k].push(ref); }
    if (p.name && p.company) { const k = `${p.name.trim().toLowerCase()}|${p.company.trim().toLowerCase()}`; if (!nameCoMap[k]) nameCoMap[k] = []; nameCoMap[k].push(ref); }
  });
  const dupKeys = new Set();
  const mark = (groups) => Object.values(groups).forEach((refs) => {
    if (refs.length < 2) return;
    if (new Set(refs.map((r) => r.userId)).size < 2) return;
    refs.forEach((r) => dupKeys.add(`${r.userId}:${r.prospectId}`));
  });
  mark(emailMap); mark(nameCoMap);
  return dupKeys;
}

/* ── Main ── */
export default function AdminPanel() {
  const { state, dispatch, user } = useStore();
  const [panelTab, setPanelTab] = useState("prospects"); // "prospects" | "users"
  const [usersData, setUsersData] = useState(null);
  const [authUsers, setAuthUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [filterDupes, setFilterDupes] = useState(false);
  const [expandedUsers, setExpandedUsers] = useState({});
  const [roleLoading, setRoleLoading] = useState({}); // userId → true

  const ownerEmails = (import.meta.env.VITE_ADMIN_EMAILS || "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const isOwner = ownerEmails.includes(user?.email?.toLowerCase());

  async function fetchAll() {
    setLoading(true); setError(null);
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
      setAuthUsers(body.authUsers || body.users?.map((u) => ({ id: u.userId, email: u.userEmail, role: u.role })) || []);
      const expanded = {};
      (body.users || []).forEach((u) => { expanded[u.userId] = true; });
      setExpandedUsers(expanded);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchAll(); }, []);

  async function deleteProspect(targetUserId, prospectId, prospectName) {
    if (!window.confirm(`Delete "${prospectName}" from this user's account? This cannot be undone.`)) return;
    try {
      const session = await supabase?.auth.getSession();
      const token = session?.data?.session?.access_token;
      const res = await fetch("/api/admin-delete-prospect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetUserId, prospectId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      // Remove from local state immediately
      setUsersData((prev) => prev.map((u) =>
        u.userId !== targetUserId ? u : { ...u, prospects: u.prospects.filter((p) => p.id !== prospectId && String(p.id) !== String(prospectId)) }
      ));
    } catch (err) { alert(err.message); }
  }

  async function changeRole(targetUserId, newRole) {
    setRoleLoading((r) => ({ ...r, [targetUserId]: true }));
    try {
      const session = await supabase?.auth.getSession();
      const token = session?.data?.session?.access_token;
      const res = await fetch("/api/admin-role", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetUserId, role: newRole }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      // Optimistically update local authUsers list
      setAuthUsers((prev) => prev.map((u) => u.id === targetUserId ? { ...u, role: newRole } : u));
    } catch (err) { alert(err.message); }
    finally { setRoleLoading((r) => ({ ...r, [targetUserId]: false })); }
  }

  const allProspects = useMemo(() => (usersData || []).flatMap((u) =>
    u.prospects.map((p) => ({ userId: u.userId, userEmail: u.userEmail, prospect: p }))
  ), [usersData]);

  const dupKeys = useMemo(() => buildDuplicateKeys(allProspects), [allProspects]);
  const adminFlags = state.adminFlags || {};

  const totalProspects = allProspects.length;
  const totalDupes = dupKeys.size;
  const totalFlagged = Object.keys(adminFlags).length;

  function toggleFlag(key, isFlagged) {
    dispatch(isFlagged ? { type: "UNFLAG_PROSPECT", payload: key } : { type: "FLAG_PROSPECT", payload: { key, note: "Duplicate" } });
  }

  const lowerSearch = search.toLowerCase();

  function filterProspects(prospects, userId) {
    return prospects.filter((p) => {
      const key = `${userId}:${p.id}`;
      const matchSearch = !lowerSearch || [p.name, p.company, p.email].some((v) => v?.toLowerCase().includes(lowerSearch));
      return matchSearch && (!filterDupes || dupKeys.has(key));
    });
  }

  if (loading) return <div style={{ padding: 32, color: "var(--text-muted)", textAlign: "center" }}>Loading…</div>;
  if (error) return (
    <div style={{ padding: 32 }}>
      <div style={{ background: "#2a1e1e", border: "1px solid #991b1b", borderRadius: 8, padding: "12px 16px", color: "#f87171" }}>{error}</div>
    </div>
  );

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>Admin Panel</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Signed in as <strong>{user?.email}</strong>
            {isOwner && <span style={{ marginLeft: 8, fontSize: 11, background: "#1e3a5f", border: "1px solid #2d5a9e", borderRadius: 20, padding: "1px 8px", color: "#60a5fa" }}>Owner</span>}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchAll}>↻ Refresh</button>
      </div>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Total Prospects", value: totalProspects },
          { label: "Users", value: usersData?.length || 0 },
          { label: "Cross-User Duplicates", value: totalDupes, color: totalDupes > 0 ? "#f59e0b" : undefined },
          { label: "Flagged", value: totalFlagged, color: totalFlagged > 0 ? "#ef4444" : undefined },
        ].map((c) => (
          <div key={c.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 20px", minWidth: 130 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: c.color || "var(--text)" }}>{c.value}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Panel tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
        {[{ id: "prospects", label: "All Prospects" }, { id: "users", label: "User Management" }].map((t) => (
          <button
            key={t.id}
            onClick={() => setPanelTab(t.id)}
            style={{
              padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
              fontFamily: "var(--font)", fontSize: 14, fontWeight: 600,
              color: panelTab === t.id ? "var(--primary-light)" : "var(--text-muted)",
              borderBottom: panelTab === t.id ? "2px solid var(--primary)" : "2px solid transparent",
              marginBottom: -1,
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* ── PROSPECTS TAB ── */}
      {panelTab === "prospects" && (
        <>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
            <input className="form-input" placeholder="Search name, company, email…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 260 }} />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-sec)", cursor: "pointer" }}>
              <input type="checkbox" checked={filterDupes} onChange={(e) => setFilterDupes(e.target.checked)} style={{ accentColor: "var(--primary)" }} />
              Duplicates only
            </label>
          </div>

          {(usersData || []).map((u) => {
            const filtered = filterProspects(u.prospects, u.userId);
            if (filtered.length === 0 && (lowerSearch || filterDupes)) return null;
            const isExpanded = expandedUsers[u.userId];
            const userRole = authUsers.find((a) => a.id === u.userId)?.role;
            return (
              <div key={u.userId} style={{ marginBottom: 20, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                <button
                  onClick={() => setExpandedUsers((p) => ({ ...p, [u.userId]: !p[u.userId] }))}
                  style={{ width: "100%", background: "var(--surface-raised)", border: "none", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", color: "var(--text)", fontFamily: "var(--font)" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{u.userEmail}</span>
                    {userRole === "admin" && <span style={{ fontSize: 11, background: "#1e3a5f", border: "1px solid #2d5a9e", borderRadius: 20, padding: "1px 8px", color: "#60a5fa" }}>admin</span>}
                    {ownerEmails.includes(u.userEmail?.toLowerCase()) && <span style={{ fontSize: 11, background: "#1c2a4a", border: "1px solid #3b5998", borderRadius: 20, padding: "1px 8px", color: "#93c5fd" }}>owner</span>}
                    <span style={{ fontSize: 12, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "1px 8px", color: "var(--text-muted)" }}>{u.prospects.length} prospects</span>
                    {u.prospects.some((p) => dupKeys.has(`${u.userId}:${p.id}`)) && (
                      <span style={{ fontSize: 11, background: "#451a03", border: "1px solid #92400e", borderRadius: 20, padding: "1px 8px", color: "#fbbf24" }}>has duplicates</span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{isExpanded ? "▲" : "▼"}</span>
                </button>

                {isExpanded && (
                  <div style={{ overflowX: "auto" }}>
                    {filtered.length === 0 ? (
                      <div style={{ padding: 16, fontSize: 13, color: "var(--text-muted)" }}>No prospects match the filter.</div>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
                            {["Name", "Company", "Email", "Status", "Touches", "Tags", "Actions"].map((h) => (
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
                              <tr key={key} style={{ borderBottom: "1px solid var(--border)", background: isFlagged ? "rgba(239,68,68,0.06)" : isDupe ? "rgba(245,158,11,0.06)" : undefined }}>
                                <td style={{ padding: "8px 12px", fontWeight: 600 }}>{p.name}</td>
                                <td style={{ padding: "8px 12px", color: "var(--text-sec)" }}>{p.company || "—"}</td>
                                <td style={{ padding: "8px 12px", color: "var(--text-muted)", fontFamily: "monospace", fontSize: 12 }}>{p.email || "—"}</td>
                                <td style={{ padding: "8px 12px" }}>
                                  <span style={{ fontSize: 11, borderRadius: 20, padding: "2px 8px", background: "var(--surface-raised)", border: "1px solid var(--border)" }}>{p.status}</span>
                                </td>
                                <td style={{ padding: "8px 12px", color: "var(--text-muted)", textAlign: "center" }}>{p.touchpoints?.length ?? 0}</td>
                                <td style={{ padding: "8px 12px" }}>
                                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                    {isDupe && <span style={{ fontSize: 11, borderRadius: 20, padding: "2px 8px", background: "#451a03", border: "1px solid #92400e", color: "#fbbf24" }}>duplicate</span>}
                                    {isFlagged && <span style={{ fontSize: 11, borderRadius: 20, padding: "2px 8px", background: "#450a0a", border: "1px solid #7f1d1d", color: "#fca5a5" }}>flagged</span>}
                                  </div>
                                </td>
                                <td style={{ padding: "8px 12px" }}>
                                  <div style={{ display: "flex", gap: 6 }}>
                                    <button
                                      onClick={() => toggleFlag(key, isFlagged)}
                                      style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, cursor: "pointer", fontFamily: "var(--font)", border: `1px solid ${isFlagged ? "#7f1d1d" : "var(--border)"}`, background: isFlagged ? "#450a0a" : "var(--surface-raised)", color: isFlagged ? "#fca5a5" : "var(--text-sec)" }}
                                    >{isFlagged ? "Unflag" : "Flag"}</button>
                                    <button
                                      onClick={() => deleteProspect(u.userId, p.id, p.name)}
                                      style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, cursor: "pointer", fontFamily: "var(--font)", border: "1px solid #7f1d1d", background: "#450a0a", color: "#fca5a5" }}
                                    >Delete</button>
                                  </div>
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
        </>
      )}

      {/* ── USERS TAB ── */}
      {panelTab === "users" && (
        <div>
          {!isOwner && (
            <div style={{ background: "#2a2a1e", border: "1px solid #92400e", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#fbbf24", marginBottom: 16 }}>
              Only the owner can promote or demote users.
            </div>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
                {["User", "Role", "Prospects", isOwner ? "Actions" : ""].filter(Boolean).map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "var(--text-sec)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {authUsers.map((u) => {
                const isThisOwner = ownerEmails.includes(u.email?.toLowerCase());
                const currentRole = isThisOwner ? "owner" : (u.role || "user");
                const prospectCount = usersData?.find((d) => d.userId === u.id)?.prospects?.length ?? 0;
                const isLoadingRole = !!roleLoading[u.id];
                return (
                  <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ fontWeight: 600 }}>{u.email}</div>
                      {u.id === user?.id && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>you</div>}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {currentRole === "owner" && <span style={{ fontSize: 12, background: "#1e3a5f", border: "1px solid #2d5a9e", borderRadius: 20, padding: "2px 10px", color: "#60a5fa" }}>Owner</span>}
                      {currentRole === "admin" && <span style={{ fontSize: 12, background: "#1a2e1a", border: "1px solid #2d5a2d", borderRadius: 20, padding: "2px 10px", color: "#4ade80" }}>Admin</span>}
                      {currentRole === "user" && <span style={{ fontSize: 12, background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 20, padding: "2px 10px", color: "var(--text-muted)" }}>User</span>}
                    </td>
                    <td style={{ padding: "10px 14px", color: "var(--text-muted)" }}>{prospectCount}</td>
                    {isOwner && (
                      <td style={{ padding: "10px 14px" }}>
                        {!isThisOwner && u.id !== user?.id && (
                          currentRole === "admin"
                            ? <button className="btn btn-ghost btn-sm" disabled={isLoadingRole} onClick={() => changeRole(u.id, "user")}>{isLoadingRole ? "…" : "Demote to User"}</button>
                            : <button className="btn btn-sm" disabled={isLoadingRole} style={{ border: "1px solid #2d5a2d", background: "#1a2e1a", color: "#4ade80" }} onClick={() => changeRole(u.id, "admin")}>{isLoadingRole ? "…" : "Promote to Admin"}</button>
                        )}
                        {(isThisOwner || u.id === user?.id) && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>—</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 14, fontSize: 12, color: "var(--text-muted)" }}>
            Promoted admins gain access to the Admin tab. They must sign out and back in for the change to take effect.
          </div>
        </div>
      )}
    </div>
  );
}
