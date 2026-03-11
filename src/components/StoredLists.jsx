import { useStore } from "../store";

export default function StoredLists({ onNavigate }) {
  const { state } = useStore();
  const lists = state.lists || [];

  // Also derive lists from prospects in case they were added before this feature
  const prospectListNames = [...new Set(state.prospects.map((p) => p.listName).filter(Boolean))];
  const storedNames = new Set(lists.map((l) => l.name));
  const legacyLists = prospectListNames
    .filter((name) => !storedNames.has(name))
    .map((name) => ({
      id: name,
      name,
      count: state.prospects.filter((p) => p.listName === name).length,
      uploadedAt: null,
      legacy: true,
    }));

  const allLists = [...lists, ...legacyLists].sort((a, b) => {
    if (!a.uploadedAt) return 1;
    if (!b.uploadedAt) return -1;
    return b.uploadedAt.localeCompare(a.uploadedAt);
  });

  return (
    <div style={{ padding: "32px" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 23, fontWeight: 700, marginBottom: 4 }}>📋 Stored Lists</div>
        <div style={{ fontSize: 14, color: "var(--text-muted)" }}>All CSV lists uploaded into OutreachOS</div>
      </div>

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
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={(e) => { e.stopPropagation(); onNavigate("list", { list: list.name }); }}
                    >
                      View →
                    </button>
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
