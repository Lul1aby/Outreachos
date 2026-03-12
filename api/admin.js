/**
 * POST /api/admin
 * Returns all users' prospects for admin review.
 *
 * The caller must send their Supabase JWT as: Authorization: Bearer <token>
 * The user's email must be in the ADMIN_EMAILS env var (comma-separated).
 *
 * Required env vars:
 *   ADMIN_EMAILS              — comma-separated admin email addresses
 *   VITE_SUPABASE_URL         — Supabase project URL
 *   VITE_SUPABASE_ANON_KEY    — Supabase anon key (to verify the JWT)
 *   SUPABASE_SERVICE_ROLE_KEY — service-role key to read all user data
 */

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return res.status(500).json({ error: "Server not configured for admin access." });
  }

  // Verify the caller's JWT
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return res.status(401).json({ error: "Invalid or expired session." });

  if (!adminEmails.includes(user.email?.toLowerCase())) {
    return res.status(403).json({ error: "Admin access only." });
  }

  // Fetch all user_data rows using service-role client
  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: rows, error: dbError } = await adminClient
    .from("user_data")
    .select("user_id, data, updated_at");

  if (dbError) return res.status(500).json({ error: dbError.message });

  // Fetch auth user list to map user_id → email
  const usersResp = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=100`, {
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
  });
  const usersBody = await usersResp.json();
  const emailMap = {};
  (usersBody.users || []).forEach((u) => { emailMap[u.id] = u.email; });

  const users = (rows || []).map((row) => ({
    userId: row.user_id,
    userEmail: emailMap[row.user_id] || row.user_id,
    updatedAt: row.updated_at,
    prospects: (row.data?.prospects || []).map((p) => ({ ...p, _ownerId: row.user_id })),
  }));

  // Include auth user list with roles for the User Management tab
  const authUsers = (usersBody.users || []).map((u) => ({
    id: u.id,
    email: u.email,
    role: u.app_metadata?.role || "user",
  }));

  return res.status(200).json({ users, authUsers });
}
