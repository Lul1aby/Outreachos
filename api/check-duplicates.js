/**
 * POST /api/check-duplicates
 * Check a list of prospects against ALL users' data for duplicates
 * by email, phone, LinkedIn URL, or name+company.
 *
 * Headers: Authorization: Bearer <user-jwt>
 * Body: { prospects: [{ email, phone, linkedin, name, company }] }
 * Returns: { matches: [{ inputIndex, field, value, matchedName, matchedCompany, ownerEmail }] }
 *
 * Required env vars:
 *   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";

function normalizePhone(p) {
  return (p || "").replace(/\D/g, "");
}

function normalizeLinkedIn(u) {
  return (u || "").toLowerCase().replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, "").replace(/\/$/, "").trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey    = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return res.status(200).json({ matches: [] }); // Fail open — don't block upload
  }

  // Verify caller JWT to get their userId (we exclude their own data from matching)
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  let callerUserId = null;
  if (token) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await userClient.auth.getUser().catch(() => ({ data: {} }));
    callerUserId = user?.id ?? null;
  }

  const { prospects = [] } = req.body || {};
  if (!prospects.length) return res.status(200).json({ matches: [] });

  // Fetch all OTHER users' data
  const adminClient = createClient(supabaseUrl, serviceKey);
  const query = adminClient.from("user_data").select("user_id, data");
  if (callerUserId) query.neq("user_id", callerUserId);
  const { data: rows, error } = await query;
  if (error || !rows) return res.status(200).json({ matches: [] });

  // Fetch email map for display
  const usersResp = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=100`, {
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
  }).catch(() => null);
  const emailMap = {};
  if (usersResp?.ok) {
    const body = await usersResp.json();
    (body.users || []).forEach((u) => { emailMap[u.id] = u.email; });
  }

  // Build lookup sets from all other users' prospects
  const emailLookup    = new Map(); // normalizedEmail → { name, company, ownerEmail }
  const phoneLookup    = new Map();
  const linkedinLookup = new Map();
  const nameCoLookup   = new Map(); // "name|company" (lowercased) → { name, company, ownerEmail }

  for (const row of rows) {
    const owner = emailMap[row.user_id] || "another user";
    for (const p of (row.data?.prospects || [])) {
      if (p.email) {
        const k = p.email.trim().toLowerCase();
        if (k) emailLookup.set(k, { name: p.name, company: p.company, ownerEmail: owner });
      }
      const ph = normalizePhone(p.phone);
      if (ph.length >= 7) phoneLookup.set(ph, { name: p.name, company: p.company, ownerEmail: owner });

      const li = normalizeLinkedIn(p.linkedin);
      if (li) linkedinLookup.set(li, { name: p.name, company: p.company, ownerEmail: owner });

      // Name + Company match
      if (p.name && p.company) {
        const nc = (p.name.trim() + "|" + p.company.trim()).toLowerCase();
        nameCoLookup.set(nc, { name: p.name, company: p.company, ownerEmail: owner });
      }
    }
  }

  // Check each input prospect
  const matches = [];
  prospects.forEach((p, i) => {
    const checked = new Set();

    if (p.email) {
      const k = p.email.trim().toLowerCase();
      const hit = emailLookup.get(k);
      if (hit && !checked.has("email:" + k)) {
        checked.add("email:" + k);
        matches.push({ inputIndex: i, field: "email", value: p.email, ...hit });
      }
    }
    const ph = normalizePhone(p.phone);
    if (ph.length >= 7) {
      const hit = phoneLookup.get(ph);
      if (hit && !checked.has("phone:" + ph)) {
        checked.add("phone:" + ph);
        matches.push({ inputIndex: i, field: "phone", value: p.phone, ...hit });
      }
    }
    const li = normalizeLinkedIn(p.linkedin);
    if (li) {
      const hit = linkedinLookup.get(li);
      if (hit && !checked.has("li:" + li)) {
        checked.add("li:" + li);
        matches.push({ inputIndex: i, field: "linkedin", value: p.linkedin, ...hit });
      }
    }
    // Name + Company match (only if no contact-field match was found for this prospect)
    if (checked.size === 0 && p.name && p.company) {
      const nc = (p.name.trim() + "|" + p.company.trim()).toLowerCase();
      const hit = nameCoLookup.get(nc);
      if (hit) {
        matches.push({ inputIndex: i, field: "name+company", value: `${p.name} at ${p.company}`, ...hit });
      }
    }
  });

  return res.status(200).json({ matches });
}
