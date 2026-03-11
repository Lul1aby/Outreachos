export const CHANNELS = ["Email", "Call", "SMS", "LinkedIn", "WhatsApp", "Other"];
export const STATUSES = ["Not Started", "Replied", "Meeting Booked", "No Response", "Not Interested", "Opportunity", "Trials", "Call Back", "Nurture"];
export const INDUSTRIES = ["Enterprise", "Commercial", "SMB", "Staffing", "GCC"];

export const STATUS_COLORS = {
  "Not Started":     { bg: "#1a1a2e", text: "#6b7280", border: "#2d2d4e" },
  "Replied":         { bg: "#1a3a2e", text: "#34d399", border: "#065f46" },
  "Meeting Booked":  { bg: "#2d1f4a", text: "#a78bfa", border: "#5b21b6" },
  "No Response":     { bg: "#2a2a1e", text: "#fbbf24", border: "#92400e" },
  "Not Interested":  { bg: "#2a1e1e", text: "#f87171", border: "#991b1b" },
  "Opportunity":     { bg: "#0d2e1a", text: "#4ade80", border: "#14532d" },
  "Trials":          { bg: "#0d2238", text: "#38bdf8", border: "#0369a1" },
  "Call Back":       { bg: "#2a1800", text: "#f97316", border: "#c2410c" },
  "Nurture":         { bg: "#1e1a2e", text: "#c084fc", border: "#7e22ce" },
};

export const CHANNEL_ICONS = {
  "Email": "✉️", "Call": "📞", "SMS": "💬", "LinkedIn": "💼", "WhatsApp": "📱", "Other": "📌",
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

export const DEFAULT_SEQUENCE = {
  id: 1,
  name: "7-Day Default Cadence",
  description: "6 calls · 4 emails · 2 LinkedIn — auto-assigned to every new contact",
  isDefault: true,
  steps: [
    { id: 101, day: 0, channel: "Call",        note: "First touch — cold call intro" },
    { id: 102, day: 0, channel: "LinkedIn DM", note: "Send connection request + short intro" },
    { id: 103, day: 1, channel: "Email",       note: "Cold email — value prop + CTA" },
    { id: 104, day: 1, channel: "Call",        note: "Follow-up call attempt #2" },
    { id: 105, day: 2, channel: "Call",        note: "Call attempt #3 — try different time" },
    { id: 106, day: 3, channel: "Email",       note: "Follow-up email — address a pain point" },
    { id: 107, day: 3, channel: "LinkedIn DM", note: "LinkedIn follow-up message" },
    { id: 108, day: 4, channel: "Call",        note: "Call attempt #4" },
    { id: 109, day: 5, channel: "Email",       note: "Social proof email — case study or result" },
    { id: 110, day: 5, channel: "Call",        note: "Call attempt #5 — leave voicemail" },
    { id: 111, day: 6, channel: "Call",        note: "Final call attempt #6" },
    { id: 112, day: 7, channel: "Email",       note: "Breakup email — last attempt" },
  ],
};

export const SEED_PROSPECTS = [
  {
    id: 1, name: "Sarah Chen", company: "NovaSaaS", title: "VP of Sales",
    industry: "SaaS", email: "sarah@novasaas.com", linkedin: "linkedin.com/in/sarahchen",
    phone: "+1 555-0101", status: "Meeting Booked",
    notes: "Interested in Q1 deal, follow up Monday", listName: "SaaStr 2026",
    touchpoints: [
      { id: 1, channel: "LinkedIn DM", date: "2026-02-10", note: "Connected and intro sent", status: "Replied" },
      { id: 2, channel: "Email", date: "2026-02-14", note: "Sent deck, she opened 3x", status: "Meeting Booked" },
    ],
    createdAt: "2026-02-08",
  },
  {
    id: 2, name: "Marcus Webb", company: "FinStream", title: "CTO",
    industry: "Fintech", email: "m.webb@finstream.io", linkedin: "", phone: "",
    status: "No Response", notes: "Cold outreach, no reply yet", listName: "Cold Outbound Q1",
    touchpoints: [
      { id: 3, channel: "Email", date: "2026-02-20", note: "Cold email #1 sent", status: "No Response" },
      { id: 4, channel: "Email", date: "2026-02-27", note: "Follow-up #1 sent", status: "No Response" },
    ],
    createdAt: "2026-02-19",
  },
  {
    id: 3, name: "Priya Sharma", company: "HealthLoop", title: "Head of Ops",
    industry: "Healthcare", email: "priya@healthloop.com", linkedin: "linkedin.com/in/priyasharma",
    phone: "+1 555-0303", status: "Replied",
    notes: "Warm, referred by David Kim", listName: "SaaStr 2026",
    touchpoints: [
      { id: 5, channel: "Call", date: "2026-03-01", note: "15 min intro call, positive", status: "Replied" },
    ],
    createdAt: "2026-02-28",
  },
];
