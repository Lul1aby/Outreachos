import { useStore } from "../store";
import { supabase } from "../supabase";

export default function Account({ theme, setTheme }) {
  const { user, syncing, flushSave } = useStore();

  const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS || "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const isOwner = !!user?.email && adminEmails.includes(user.email.toLowerCase());
  const isAdmin = isOwner || user?.app_metadata?.role === "admin";

  const role = isOwner ? "Owner" : isAdmin ? "Admin" : "User";
  const roleColor = isOwner ? "#f59e0b" : isAdmin ? "#a78bfa" : "var(--text-muted)";

  async function handleSignOut() {
    await flushSave();
    await supabase?.auth.signOut();
  }

  return (
    <div style={{ padding: "32px", maxWidth: 520 }}>
      {/* Page title */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 23, fontWeight: 700, marginBottom: 4 }}>👤 Account</div>
        <div style={{ fontSize: 14, color: "var(--text-muted)" }}>Manage your profile and preferences</div>
      </div>

      {/* Profile card */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 16 }}>Profile</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 52, height: 52, borderRadius: "50%",
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, fontWeight: 700, color: "#fff", flexShrink: 0,
          }}>
            {user?.email?.[0]?.toUpperCase() || "?"}
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 2 }}>
              {user?.email?.split("@")[0] || "—"}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{user?.email || "—"}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Row label="Email" value={user?.email || "—"} />
          <Row label="Role">
            <span style={{ fontSize: 13, fontWeight: 600, color: roleColor }}>{role}</span>
          </Row>
          <Row label="User ID">
            <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>{user?.id || "—"}</span>
          </Row>
          <Row label="Cloud sync">
            {syncing
              ? <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>↑ syncing…</span>
              : <span style={{ fontSize: 13, color: "var(--success)" }}>● Saved</span>}
          </Row>
        </div>
      </div>

      {/* Appearance card */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 16 }}>Appearance</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>Theme</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Currently using <strong>{theme === "dark" ? "Dark" : "Light"}</strong> mode
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <ThemeOption
              label="🌙 Dark"
              active={theme === "dark"}
              onClick={() => setTheme("dark")}
            />
            <ThemeOption
              label="☀️ Light"
              active={theme === "light"}
              onClick={() => setTheme("light")}
            />
          </div>
        </div>
      </div>

      {/* Sign out card */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 16 }}>Session</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>Sign out</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Your data is saved to the cloud before signing out.</div>
          </div>
          <button
            className="btn"
            style={{ border: "1px solid #7f1d1d", background: "#450a0a", color: "#fca5a5", whiteSpace: "nowrap" }}
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{label}</span>
      {children || <span style={{ fontSize: 13, color: "var(--text)" }}>{value}</span>}
    </div>
  );
}

function ThemeOption({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 14px",
        borderRadius: 8,
        border: active ? "1px solid var(--primary)" : "1px solid var(--border)",
        background: active ? "var(--primary-dim, rgba(99,102,241,0.15))" : "var(--surface-raised)",
        color: active ? "var(--primary-light)" : "var(--text-muted)",
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
