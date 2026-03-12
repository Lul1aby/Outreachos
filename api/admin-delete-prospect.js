/**
 * POST /api/admin-delete-prospect
 * Delete a specific prospect from any user's data.
 * Only admins (ADMIN_EMAILS or app_metadata.role === 'admin') can call this.
 *
 * Body: { targetUserId, prospectId }
 */

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey    = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminEmails = (process.env.ADMIN_EMAILS || "")
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

  // Must be owner or promoted admin
  const isOwner = adminEmails.includes(user.email?.toLowerCase());
  const isAdmin = isOwner || user.app_metadata?.role === "admin";
  if (!isAdmin) return res.status(403).json({ error: "Admin access required." });

  const { targetUserId, prospectId } = req.body || {};
  if (!targetUserId || !prospectId) {
    return res.status(400).json({ error: "targetUserId and prospectId are required." });
  }

  const adminClient = createClient(supabaseUrl, serviceKey);

  // Fetch the target user's data
  const { data: row, error: fetchErr } = await adminClient
    .from("user_data")
    .select("data")
    .eq("user_id", targetUserId)
    .single();

  if (fetchErr || !row) return res.status(404).json({ error: "User data not found." });

  const prospects = row.data?.prospects || [];
  const updated = prospects.filter((p) => p.id !== prospectId && String(p.id) !== String(prospectId));

  if (updated.length === prospects.length) {
    return res.status(404).json({ error: "Prospect not found." });
  }

  const { error: updateErr } = await adminClient
    .from("user_data")
    .update({ data: { ...row.data, prospects: updated } })
    .eq("user_id", targetUserId);

  if (updateErr) return res.status(500).json({ error: updateErr.message });
  return res.status(200).json({ success: true, deleted: prospectId });
}
