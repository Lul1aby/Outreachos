import { useState } from "react";
import { useStore } from "../store";

export default function StoredLists({ onNavigate }) {
  const { state, dispatch } = useStore();
  const [confirmList, setConfirmList] = useState(null); // { name } when confirming delete

  const lists = state.lists || [];
  const prospectListNames = [...new Set(state.prospects.map((p) => p.listName).filter(Boolean))];
  const storedNames = new Set(lists.map((l) => l.name));
  const legacyLists = prospectListNames
    .filter((name) => !storedNames.has(name))
    .map((name) => ({
      id: name, name, count: state.prospects.filter((p) => p.listName === name).length,
      uploadedAt: null, legacy: true,
    }));

  const allLists = [...lists, ...legacyLists].sort((a, b) => {
    if (!a.uploadedAt) return 1;
    if (!b.uploadedAt) return -1;
    return b.uploadedAt.localeCompare(a.uploadedAt);
  });

  function deleteList(listName, deleteProspects) {
    dispatch({ type: "DELETE_LIST", payload: { listName, deleteProspects } });
    setConfirmList(null);
  }

  const confirmCount = confirmList
    ? state.prospects.filter((p) => p.listName === confirmList.name).length
    : 0;

  return (
    <div style={{ padding: "32px" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 23, fontWeight: 700, marginBottom: 4 }}>📋 Stored Lists</div>
        <div style={{ fontSize: 14, color: "var(--text-muted)" }}>All CSV lists uploaded into OutreachOS</div>
      </div>

      {/* Delete confirmation modal */}
      {confirmList && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 28, maxWidth: 420, width: "90%" }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Delete "{confirmList.name}"?</div>
            <div style={{ fontSize: 14, color: "var(--text-sec)", marginBottom: 20 }}>
              This list has <strong>{confirmCount}</strong> prospect{confirmCount !== 1 ? "s" : ""}. Choose what to do with them:
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              <button
                className="btn"
                style={{ justifyContent: "flex-start", padding: "12px 16px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-raised)", textAlign: "left" }}
                onClick={() => deleteList(confirmList.name, false)}
              >
                <div style={{ fontWeight: 600, marginBottom: 2 }}>Delete list only</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400 }}>Keep the {confirmCount} contacts — just remove the list tag</div>
              </button>
              <button
                className="btn"
                style={{ justifyContent: "flex-start", padding: "12px 16px", border: "1px solid #7f1d1d", borderRadius: 8, background: "#450a0a", textAlign: "left" }}
                onClick={() => deleteList(confirmList.name, true)}
              >
                <div style={{ fontWeight: 600, marginBottom: 2, color: "#fca5a5" }}>Delete list + all {confirmCount} contacts</div>
                <div style={{ fontSize: 12, color: "#f87171", fontWeight: 400 }}>Permanently removes all prospects in this list</div>
              </button>
            </div>
            <button className="btn btn-ghost" onClick={() => setConfirmList(null)} style={{ width: "100%" }}>Cancel</button>
          </div>
        </div>
      )}

      {allLists.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-muted)" }}>
          <div style={{ fontSize: 42, marginBottom: 12 }}>📂</div>
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>No lists yet</div>
          <div style={{ fontSize: 14 }}>Import a CSV to get started. Lists will appear here automatically.</div>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>List Name</th>
              <th>Contacts</th>
              <th>Date Uploaded</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {allLists.map((list) => {
              const total = state.prospects.filter((p) => p.listName === list.name).length;
              const active = state.prospects.filter((p) => p.listName === list.name && !["Not Interested"].includes(p.status)).length;
              return (
                <tr key={list.id} onClick={() => onNavigate("list", { list: list.name })} style={{ cursor: "pointer" }}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>📋 {list.name}</div>
                  </td>
                  <td>
                    <span className="mono" style={{ fontSize: 14, color: "var(--primary-light)" }}>{total}</span>
                  </td>
                  <td>
                    <span className="mono" style={{ fontSize: 14, color: "var(--text-sec)" }}>
                      {list.uploadedAt
                        ? new Date(list.uploadedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
                        : <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>—</span>}
                    </span>
                  </td>
                  <td>
                    <span className="mono" style={{ fontSize: 14, color: "var(--success-bright)" }}>{active}</span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-sm" onClick={() => onNavigate("list", { list: list.name })}>View →</button>
                      <button
                        className="btn btn-sm"
                        style={{ border: "1px solid #7f1d1d", background: "#450a0a", color: "#fca5a5" }}
                        onClick={() => setConfirmList(list)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
