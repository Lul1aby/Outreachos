/**
 * POST /api/invite
 * Validates an invite code and checks whether the user limit (5) has been reached.
 *
 * Required env vars:
 *   INVITE_CODE              — shared secret code for sign-up
 *   SUPABASE_SERVICE_ROLE_KEY — service-role key to count auth users (bypasses RLS)
 *   VITE_SUPABASE_URL        — your Supabase project URL (already set)
 */

const MAX_USERS = 5;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { inviteCode } = req.body || {};
  const validCode = process.env.INVITE_CODE;

  if (!validCode) {
    return res.status(500).json({ error: "INVITE_CODE is not configured in environment variables" });
  }
  if (!inviteCode || inviteCode.trim() !== validCode.trim()) {
    return res.status(403).json({ valid: false, error: "Invalid invite code" });
  }

  /* ── Count existing users via Supabase Admin API ── */
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    // Can't verify count — allow signup, just validate the code
    return res.status(200).json({ valid: true, currentCount: null, maxUsers: MAX_USERS });
  }

  try {
    const resp = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=100`, {
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": serviceKey,
      },
    });

    if (!resp.ok) {
      // Can't count — still allow signup since code is valid
      return res.status(200).json({ valid: true, currentCount: null, maxUsers: MAX_USERS });
    }

    const data = await resp.json();
    const count = data.users?.length ?? 0;

    if (count >= MAX_USERS) {
      return res.status(403).json({
        valid: false,
        error: `Team is full (${MAX_USERS}/${MAX_USERS} users). Contact your admin to free a slot.`,
      });
    }

    return res.status(200).json({ valid: true, currentCount: count, maxUsers: MAX_USERS });
  } catch {
    // Network error — allow signup with valid code
    return res.status(200).json({ valid: true, currentCount: null, maxUsers: MAX_USERS });
  }
}
