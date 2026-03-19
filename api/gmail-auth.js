import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { action, code, redirectUri } = req.body || {};

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ error: "Gmail integration not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars." });
  }

  // Authenticate the user via Supabase JWT
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Not authenticated" });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: "Invalid token" });

  try {
    if (action === "get-auth-url") {
      // Generate Google OAuth URL for Gmail access
      const scopes = [
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
      ].join(" ");

      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: scopes,
        access_type: "offline",
        prompt: "consent",
        state: user.id,
      });

      return res.status(200).json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    }

    if (action === "exchange-code") {
      // Exchange authorization code for tokens
      if (!code || !redirectUri) return res.status(400).json({ error: "Missing code or redirectUri" });

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) return res.status(400).json({ error: tokenData.error_description || "Token exchange failed" });

      // Get user's Gmail address
      const profileRes = await fetch("https://www.googleapis.com/gmail/v1/users/me/profile", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profile = await profileRes.json();

      // Store tokens in Supabase (encrypted via RLS — only this user can read their own row)
      await supabase.from("gmail_tokens").upsert({
        user_id: user.id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
        gmail_address: profile.emailAddress,
        updated_at: new Date().toISOString(),
      });

      return res.status(200).json({ connected: true, email: profile.emailAddress });
    }

    if (action === "status") {
      // Check if user has Gmail connected
      const { data } = await supabase
        .from("gmail_tokens")
        .select("gmail_address, expires_at")
        .eq("user_id", user.id)
        .single();

      return res.status(200).json({
        connected: !!data,
        email: data?.gmail_address || null,
      });
    }

    if (action === "disconnect") {
      await supabase.from("gmail_tokens").delete().eq("user_id", user.id);
      return res.status(200).json({ disconnected: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    console.error("[gmail-auth] error:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Gmail auth failed" });
  }
}

/* Helper: refresh access token if expired */
export async function getValidToken(supabase, userId) {
  const { data } = await supabase
    .from("gmail_tokens")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!data) return null;

  // Check if token is still valid (5 min buffer)
  if (new Date(data.expires_at) > new Date(Date.now() + 5 * 60 * 1000)) {
    return data.access_token;
  }

  // Refresh the token
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: data.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const tokenData = await res.json();
  if (!res.ok) throw new Error("Token refresh failed");

  await supabase.from("gmail_tokens").update({
    access_token: tokenData.access_token,
    expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);

  return tokenData.access_token;
}
