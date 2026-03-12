/**
 * POST /api/hubspot
 * Finds a HubSpot contact by email, creates a note with the touchpoint details.
 *
 * Body: { email, prospectName, company, touchpoint: { channel, date, note, status } }
 * Requires HUBSPOT_ACCESS_TOKEN env var (a HubSpot Private App token).
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "HUBSPOT_ACCESS_TOKEN is not configured in environment variables" });
  }

  const { email, prospectName, company, touchpoint } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: "Prospect email is required to sync with HubSpot" });
  }

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };

  /* ── 1. Search for a contact by email ── */
  let searchRes;
  try {
    searchRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
      method: "POST",
      headers,
      body: JSON.stringify({
        filterGroups: [{
          filters: [{ propertyName: "email", operator: "EQ", value: email.toLowerCase() }],
        }],
        properties: ["email", "firstname", "lastname", "company"],
        limit: 1,
      }),
    });
  } catch (err) {
    return res.status(502).json({ error: "Could not reach HubSpot — check your access token" });
  }

  if (!searchRes.ok) {
    const body = await searchRes.json().catch(() => ({}));
    return res.status(searchRes.status).json({ error: body.message || "HubSpot contact search failed" });
  }

  const searchData = await searchRes.json();
  const contact = searchData.results?.[0];

  if (!contact) {
    return res.status(404).json({
      found: false,
      error: `No HubSpot contact found with email: ${email}`,
    });
  }

  const contactName = [contact.properties.firstname, contact.properties.lastname]
    .filter(Boolean).join(" ") || email;

  /* ── 2. Build note body ── */
  const { channel = "", date = "", note = "", status = "" } = touchpoint || {};
  const channelIcons = {
    Email: "✉️", Call: "📞", SMS: "💬", LinkedIn: "💼", WhatsApp: "📱", Other: "📌",
  };
  const icon = channelIcons[channel] || "📌";

  const noteLines = [
    `${icon} OutreachOS — ${channel} | ${date}`,
    `Outcome: ${status}`,
    note ? `Note: ${note}` : null,
    `—`,
    `Prospect: ${prospectName || ""}${company ? ` · ${company}` : ""}`,
    `Logged via OutreachOS`,
  ].filter((l) => l !== null);

  const noteBody = noteLines.join("\n");

  // HubSpot timestamp expects Unix ms
  const ts = date
    ? new Date(date + "T12:00:00Z").getTime()
    : Date.now();

  /* ── 3. Create note with association to the contact ── */
  // associationTypeId 202 = note → contact (HUBSPOT_DEFINED)
  let noteRes;
  try {
    noteRes = await fetch("https://api.hubapi.com/crm/v3/objects/notes", {
      method: "POST",
      headers,
      body: JSON.stringify({
        properties: {
          hs_note_body: noteBody,
          hs_timestamp: ts.toString(),
        },
        associations: [{
          to: { id: contact.id },
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }],
        }],
      }),
    });
  } catch (err) {
    return res.status(502).json({ error: "Could not reach HubSpot when creating note" });
  }

  if (!noteRes.ok) {
    const body = await noteRes.json().catch(() => ({}));
    return res.status(noteRes.status).json({ error: body.message || "Failed to create HubSpot note" });
  }

  const noteData = await noteRes.json();

  return res.status(200).json({
    found: true,
    contactId: contact.id,
    contactName,
    noteId: noteData.id,
  });
}
