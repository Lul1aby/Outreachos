/**
 * POST /api/admin-role
 * Promote or demote a user's role.
 *
 * Only the owner (email in ADMIN_EMAILS) can call this.
 * Body: { targetUserId, role }  — role is "admin" | "user"
 *
 * Required env vars:
 *   ADMIN_EMAILS, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey    = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ownerEmails = (process.env.ADMIN_EMAILS || "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return res.status(500).json({ error: "Server not configured." });
  }

  // Verify caller JWT
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return res.status(401).json({ error: "Invalid session." });

  // Only owners (from env ADMIN_EMAILS) can promote/demote
  if (!ownerEmails.includes(user.email?.toLowerCase())) {
    return res.status(403).json({ error: "Only the owner can change roles." });
  }

  const { targetUserId, role } = req.body || {};
  if (!targetUserId || !["admin", "user"].includes(role)) {
    return res.status(400).json({ error: "Invalid request. Provide targetUserId and role ('admin' or 'user')." });
  }

  // Prevent owner from demoting themselves
  if (targetUserId === user.id) {
    return res.status(400).json({ error: "You cannot change your own role." });
  }

  const adminClient = createClient(supabaseUrl, serviceKey);
  const { error: updateErr } = await adminClient.auth.admin.updateUserById(targetUserId, {
    app_metadata: { role },
  });

  if (updateErr) return res.status(500).json({ error: updateErr.message });
  return res.status(200).json({ success: true, role });
}
