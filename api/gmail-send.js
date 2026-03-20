import { createClient } from "@supabase/supabase-js";
import { getValidToken } from "./gmail-auth.js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { to, subject, body, prospectId } = req.body || {};
  if (!to || !subject || !body) {
    return res.status(400).json({ error: "Missing to, subject, or body" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Not authenticated" });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: "Invalid token" });

  try {
    const accessToken = await getValidToken(supabase, user.id);
    if (!accessToken) return res.status(400).json({ error: "Gmail not connected. Please connect your Gmail account first." });

    // Get sender's email
    const { data: gmailData } = await supabase
      .from("gmail_tokens")
      .select("gmail_address")
      .eq("user_id", user.id)
      .single();

    const fromEmail = gmailData?.gmail_address || user.email;

    // Build RFC 2822 email message
    const emailLines = [
      `From: ${fromEmail}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: text/html; charset=utf-8`,
      `MIME-Version: 1.0`,
      "",
      body,
    ];
    const rawMessage = emailLines.join("\r\n");
    // Base64url encode the message
    const encoded = Buffer.from(rawMessage)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // Send via Gmail API
    const sendRes = await fetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encoded }),
    });

    const sendData = await sendRes.json();
    if (!sendRes.ok) {
      throw new Error(sendData.error?.message || "Gmail send failed");
    }

    return res.status(200).json({
      sent: true,
      messageId: sendData.id,
      threadId: sendData.threadId,
      prospectId,
    });
  } catch (err) {
    console.error("[gmail-send] error:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Email send failed" });
  }
}
