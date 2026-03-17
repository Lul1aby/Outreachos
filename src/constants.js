export const CHANNELS = ["Call", "Email", "LinkedIn", "WhatsApp", "SMS", "Other"];
export const STATUSES = ["Not Started", "Replied", "Meeting Booked", "No Response", "Not Interested", "Opportunity", "Trials", "Call Back", "Nurture", "DNP/Busy", "Connected +ve", "Wrong/Invalid"];
export const INDUSTRIES = ["Enterprise", "Commercial", "SMB", "Staffing", "GCC"];

export const CHANNEL_OUTCOMES = {
  "Call":      ["DNP/Busy", "Connected +ve", "Call Back", "Nurture", "Not Interested", "Wrong/Invalid", "Meeting Booked"],
  "Email":     ["Sent", "Replied", "Not Interested", "Nurture", "Meeting Booked"],
  "LinkedIn":  ["Connection Req Sent", "Accepted", "Pending", "Replied", "Not Interested", "Nurture", "Meeting Booked"],
  "WhatsApp":  ["No Response", "Not Interested", "Meeting Booked"],
  "SMS":       ["No Response", "Not Interested", "Meeting Booked"],
  "Other":     ["No Response", "Not Interested", "Meeting Booked"],
};

/* Channels where outcome is optional (logged as activity without requiring a response outcome) */
export const OPTIONAL_OUTCOME_CHANNELS = new Set(["Email", "LinkedIn"]);

export const STATUS_COLORS = {
  "Not Started":    { bg: "var(--st-ns-bg)", text: "var(--st-ns-text)", border: "var(--st-ns-border)" },
  "Replied":        { bg: "var(--st-re-bg)", text: "var(--st-re-text)", border: "var(--st-re-border)" },
  "Meeting Booked": { bg: "var(--st-mb-bg)", text: "var(--st-mb-text)", border: "var(--st-mb-border)" },
  "No Response":    { bg: "var(--st-nr-bg)", text: "var(--st-nr-text)", border: "var(--st-nr-border)" },
  "Not Interested": { bg: "var(--st-ni-bg)", text: "var(--st-ni-text)", border: "var(--st-ni-border)" },
  "Opportunity":    { bg: "var(--st-op-bg)", text: "var(--st-op-text)", border: "var(--st-op-border)" },
  "Trials":         { bg: "var(--st-tr-bg)", text: "var(--st-tr-text)", border: "var(--st-tr-border)" },
  "Call Back":      { bg: "var(--st-cb-bg)", text: "var(--st-cb-text)", border: "var(--st-cb-border)" },
  "Nurture":        { bg: "var(--st-nu-bg)", text: "var(--st-nu-text)", border: "var(--st-nu-border)" },
  "DNP/Busy":       { bg: "var(--st-db-bg)", text: "var(--st-db-text)", border: "var(--st-db-border)" },
  "Connected +ve":  { bg: "var(--st-cv-bg)", text: "var(--st-cv-text)", border: "var(--st-cv-border)" },
  "Wrong/Invalid":  { bg: "var(--st-wi-bg)", text: "var(--st-wi-text)", border: "var(--st-wi-border)" },
  "Sent":              { bg: "var(--st-ns-bg)", text: "var(--st-ns-text)", border: "var(--st-ns-border)" },
  "Connection Req Sent": { bg: "#1e1b4b", text: "#818cf8", border: "#4338ca" },
  "Accepted":         { bg: "#052e16", text: "#4ade80", border: "#166534" },
  "Pending":          { bg: "#1c1917", text: "#fbbf24", border: "#92400e" },
};

export const CHANNEL_ICONS = {
  "Email": "✉️", "Call": "📞", "SMS": "💬", "LinkedIn": "💼", "WhatsApp": "📱", "Other": "📌",
};

export const DEFAULT_SEQUENCE = {
  id: 1,
  name: "7-Day Default Cadence",
  description: "6 calls · 4 emails · 2 LinkedIn — auto-assigned to every new contact",
  isDefault: true,
  steps: [
    { id: 101, day: 0, channel: "Call",     note: "First touch — cold call intro" },
    { id: 102, day: 0, channel: "LinkedIn", note: "Send connection request + short intro" },
    { id: 103, day: 1, channel: "Email",    note: "Cold email — value prop + CTA" },
    { id: 104, day: 1, channel: "Call",     note: "Follow-up call attempt #2" },
    { id: 105, day: 2, channel: "Call",     note: "Call attempt #3 — try different time" },
    { id: 106, day: 3, channel: "Email",    note: "Follow-up email — address a pain point" },
    { id: 107, day: 3, channel: "LinkedIn", note: "LinkedIn follow-up message" },
    { id: 108, day: 4, channel: "Call",     note: "Call attempt #4" },
    { id: 109, day: 5, channel: "Email",    note: "Social proof email — case study or result" },
    { id: 110, day: 5, channel: "Call",     note: "Call attempt #5 — leave voicemail" },
    { id: 111, day: 6, channel: "Call",     note: "Final call attempt #6" },
    { id: 112, day: 7, channel: "Email",    note: "Breakup email — last attempt" },
  ],
};

export const CSV_FIELDS = [
  { key: "name",     label: "Full Name",    required: true },
  { key: "company",  label: "Company",      required: true },
  { key: "title",    label: "Title" },
  { key: "industry", label: "Industry" },
  { key: "email",    label: "Email" },
  { key: "phone",    label: "Phone" },
  { key: "linkedin", label: "LinkedIn URL" },
  { key: "status",   label: "Status" },
  { key: "listName", label: "List Name" },
  { key: "notes",    label: "Notes" },
];

