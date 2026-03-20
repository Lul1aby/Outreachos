import { createClient } from "@supabase/supabase-js";
import { getValidToken } from "./gmail-auth.js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { prospectEmails } = req.body || {};
  // prospectEmails: [{ email, prospectId, lastSyncedMessageId }]

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Not authenticated" });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: "Invalid token" });

  try {
    const accessToken = await getValidToken(supabase, user.id);
    if (!accessToken) return res.status(400).json({ error: "Gmail not connected" });

    if (!Array.isArray(prospectEmails) || prospectEmails.length === 0) {
      return res.status(200).json({ updates: [] });
    }

    const updates = [];

    // Check for replies from each prospect email (batch up to 20)
    const toCheck = prospectEmails.slice(0, 20);

    for (const { email, prospectId } of toCheck) {
      if (!email) continue;

      // Search for messages FROM this prospect in the last 30 days
      const query = `from:${email} newer_than:30d`;
      const searchRes = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=5`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const searchData = await searchRes.json();

      if (!searchData.messages || searchData.messages.length === 0) continue;

      // Get the latest message details
      const msgRes = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${searchData.messages[0].id}?format=metadata&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const msgData = await msgRes.json();

      const subjectHeader = msgData.payload?.headers?.find((h) => h.name === "Subject");
      const dateHeader = msgData.payload?.headers?.find((h) => h.name === "Date");

      updates.push({
        prospectId,
        email,
        replyCount: searchData.messages.length,
        latestSubject: subjectHeader?.value || "",
        latestDate: dateHeader?.value || "",
        messageId: searchData.messages[0].id,
        snippet: msgData.snippet || "",
      });
    }

    // Also check for emails WE sent (to track sent status)
    const sentUpdates = [];
    for (const { email, prospectId } of toCheck) {
      if (!email) continue;

      const query = `to:${email} in:sent newer_than:30d`;
      const searchRes = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=10`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const searchData = await searchRes.json();

      if (searchData.messages?.length) {
        sentUpdates.push({
          prospectId,
          email,
          sentCount: searchData.messages.length,
        });
      }
    }

    return res.status(200).json({ updates, sentUpdates });
  } catch (err) {
    console.error("[gmail-sync] error:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Gmail sync failed" });
  }
}
