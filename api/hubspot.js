/**
 * POST /api/hubspot
 * Finds a HubSpot contact by email and logs a Call engagement.
 * Only used for Call-channel touchpoints — other channels are tracked natively by HubSpot.
 *
 * Body: { email, prospectName, company, touchpoint: { date, note, status } }
 * Requires HUBSPOT_ACCESS_TOKEN env var (a HubSpot Private App token).
 * Required scopes: crm.objects.contacts.read, crm.objects.calls.write
 */

// Map OutreachOS call outcomes → HubSpot hs_call_status values
const CALL_STATUS_MAP = {
  "DNP/Busy":      "NO_ANSWER",
  "Connected +ve": "COMPLETED",
  "Nurture":       "COMPLETED",
  "Not Interested":"COMPLETED",
  "Wrong/Invalid": "FAILED",
  "Meeting Booked":"COMPLETED",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "HUBSPOT_ACCESS_TOKEN is not configured" });
  }

  const { email, prospectName, company, touchpoint } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: "Prospect email is required" });
  }

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };

  /* ── 1. Find contact by email ── */
  let searchRes;
  try {
    searchRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
      method: "POST",
      headers,
      body: JSON.stringify({
        filterGroups: [{
          filters: [{ propertyName: "email", operator: "EQ", value: email.toLowerCase() }],
        }],
        properties: ["email", "firstname", "lastname"],
        limit: 1,
      }),
    });
  } catch {
    return res.status(502).json({ error: "Could not reach HubSpot" });
  }

  if (!searchRes.ok) {
    const body = await searchRes.json().catch(() => ({}));
    return res.status(searchRes.status).json({ error: body.message || "HubSpot contact search failed" });
  }

  const contact = (await searchRes.json()).results?.[0];
  if (!contact) {
    return res.status(404).json({ found: false, error: `No HubSpot contact found for: ${email}` });
  }

  const contactName = [contact.properties.firstname, contact.properties.lastname]
    .filter(Boolean).join(" ") || email;

  /* ── 2. Build call engagement ── */
  const { date = "", note = "", status = "" } = touchpoint || {};

  const callStatus = CALL_STATUS_MAP[status] || "COMPLETED";
  const ts = date ? new Date(date + "T12:00:00Z").getTime() : Date.now();

  const callBody = [
    `Outcome: ${status}`,
    note || null,
    `Prospect: ${prospectName || ""}${company ? ` · ${company}` : ""}`,
    `Logged via OutreachOS`,
  ].filter(Boolean).join("\n");

  /* ── 3. Create HubSpot Call — associationTypeId 194 = call → contact ── */
  let callRes;
  try {
    callRes = await fetch("https://api.hubapi.com/crm/v3/objects/calls", {
      method: "POST",
      headers,
      body: JSON.stringify({
        properties: {
          hs_call_title:     `Outbound Call — ${status}`,
          hs_call_body:      callBody,
          hs_call_direction: "OUTBOUND",
          hs_call_status:    callStatus,
          hs_timestamp:      ts.toString(),
        },
        associations: [{
          to: { id: contact.id },
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 194 }],
        }],
      }),
    });
  } catch {
    return res.status(502).json({ error: "Could not reach HubSpot when logging call" });
  }

  if (!callRes.ok) {
    const body = await callRes.json().catch(() => ({}));
    return res.status(callRes.status).json({ error: body.message || "Failed to log call in HubSpot" });
  }

  const callData = await callRes.json();
  return res.status(200).json({ found: true, contactId: contact.id, contactName, callId: callData.id });
}
