import { useState } from "react";
import { supabase } from "../supabase";

const REMEMBERED_EMAIL_KEY = "outreach-remembered-email";

export default function AuthPage() {
  const [mode, setMode] = useState("login"); // "login" | "signup" | "reset"
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBERED_EMAIL_KEY) || "");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(() => !!localStorage.getItem(REMEMBERED_EMAIL_KEY));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (remember) localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
        else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Check your email to confirm your account, then log in.");
        setMode("login");
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setMessage("Password reset link sent — check your email.");
        setMode("login");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--bg)",
      padding: 24,
    }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>⚡</div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text)" }}>
            OutreachOS
          </div>
          <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>
            {mode === "login" ? "Sign in to your account" : mode === "signup" ? "Create an account" : "Reset your password"}
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "28px 32px",
        }}>
          {message && (
            <div style={{ background: "#0d2e1a", border: "1px solid #1a5c36", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 14, color: "#4ade80" }}>
              {message}
            </div>
          )}
          {error && (
            <div style={{ background: "#2a1e1e", border: "1px solid #991b1b", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 14, color: "#f87171" }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-sec)", marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoFocus
                style={{ width: "100%", boxSizing: "border-box" }}
              />
            </div>

            {mode !== "reset" && (
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-sec)", marginBottom: 6 }}>
                  Password
                </label>
                <input
                  type="password"
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "Min 6 characters" : "Your password"}
                  required
                  minLength={6}
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>
            )}

            {mode === "reset" && <div style={{ marginBottom: 24 }} />}

            {mode === "login" && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, cursor: "pointer", fontSize: 14, color: "var(--text-sec)" }}>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  style={{ width: 15, height: 15, cursor: "pointer", accentColor: "var(--primary)" }}
                />
                Remember my email
              </label>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: "100%", justifyContent: "center", padding: "10px 0", fontSize: 15 }}
            >
              {loading
                ? "Please wait…"
                : mode === "login" ? "Sign In"
                : mode === "signup" ? "Create Account"
                : "Send Reset Link"}
            </button>
          </form>
        </div>

        {/* Footer links */}
        <div style={{ textAlign: "center", marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          {mode === "login" && (
            <>
              <button
                onClick={() => { setMode("signup"); setError(null); setMessage(null); }}
                style={{ background: "none", border: "none", color: "var(--primary-light)", fontSize: 14, cursor: "pointer", fontFamily: "var(--font)" }}
              >
                Don't have an account? Sign up
              </button>
              <button
                onClick={() => { setMode("reset"); setError(null); setMessage(null); }}
                style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", fontFamily: "var(--font)" }}
              >
                Forgot password?
              </button>
            </>
          )}
          {mode !== "login" && (
            <button
              onClick={() => { setMode("login"); setError(null); setMessage(null); }}
              style={{ background: "none", border: "none", color: "var(--primary-light)", fontSize: 14, cursor: "pointer", fontFamily: "var(--font)" }}
            >
              ← Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
