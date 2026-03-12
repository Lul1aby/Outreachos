import { useState } from "react";
import { useStore } from "../store";

export default function StoredLists({ onNavigate, onAdd }) {
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
          <div style={{ background: "var(--surface)", border: "1px solid #7f1d1d", borderRadius: 14, padding: 28, maxWidth: 380, width: "90%" }}>
            <div style={{ fontSize: 20, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Delete "{confirmList.name}"?</div>
            <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 24, lineHeight: 1.5 }}>
              This will permanently delete the list and all <strong style={{ color: "var(--text)" }}>{confirmCount} contact{confirmCount !== 1 ? "s" : ""}</strong> in it. This cannot be undone.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setConfirmList(null)} style={{ flex: 1 }}>Cancel</button>
              <button
                className="btn"
                style={{ flex: 1, border: "1px solid #7f1d1d", background: "#450a0a", color: "#fca5a5", fontWeight: 600 }}
                onClick={() => deleteList(confirmList.name, true)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {allLists.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-muted)" }}>
          <div style={{ fontSize: 42, marginBottom: 12 }}>📂</div>
          <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>No lists yet</div>
          <div style={{ fontSize: 14, marginBottom: 20 }}>Assign a list name when importing a CSV or adding a prospect manually.</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            {onAdd && <button className="btn btn-primary" onClick={onAdd}>+ Add Prospect</button>}
            <button className="btn btn-outline" onClick={() => onNavigate("home")}>← Back to Home</button>
          </div>
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
