// This endpoint handles the OAuth redirect from Google after the user authorizes Gmail access.
// It exchanges the code for tokens and closes the popup window.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

export default async function handler(req, res) {
  const { code, state: userId } = req.query;

  if (!code || !userId) {
    return res.status(400).send("<html><body><h2>Authorization failed</h2><p>Missing code or state.</p><script>window.close()</script></body></html>");
  }

  try {
    const redirectUri = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}/api/gmail-callback`;

    // Exchange code for tokens
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
    if (!tokenRes.ok) {
      return res.status(400).send(`<html><body><h2>Token exchange failed</h2><p>${tokenData.error_description || "Unknown error"}</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`);
    }

    // Get Gmail address
    const profileRes = await fetch("https://www.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();

    // Store tokens
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    await supabase.from("gmail_tokens").upsert({
      user_id: userId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      gmail_address: profile.emailAddress,
      updated_at: new Date().toISOString(),
    });

    // Return HTML that closes the popup
    return res.status(200).send(`
      <html>
        <body style="background:#0a0a0a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
          <div style="text-align:center">
            <div style="font-size:48px;margin-bottom:16px">✅</div>
            <h2 style="margin:0 0 8px">Gmail Connected!</h2>
            <p style="color:#888">${profile.emailAddress}</p>
            <p style="color:#666;font-size:14px">This window will close automatically…</p>
          </div>
          <script>setTimeout(()=>window.close(),2000)</script>
        </body>
      </html>
    `);
  } catch (err) {
    return res.status(500).send(`<html><body><h2>Error</h2><p>${err.message}</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`);
  }
}
