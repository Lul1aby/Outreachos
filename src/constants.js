export const CHANNELS = ["Call", "Email", "LinkedIn DM", "LinkedIn InMail", "SMS", "Twitter/X", "Other"];
export const STATUSES = ["Not Started", "Contacted", "Replied", "Meeting Booked", "No Response", "Not Interested", "Closed Won", "Closed Lost"];
export const INDUSTRIES = ["SaaS", "Fintech", "Healthcare", "E-commerce", "Agency", "Enterprise", "Startup", "Other"];

export const STATUS_COLORS = {
  "Not Started":     { bg: "#1a1a2e", text: "#6b7280", border: "#2d2d4e" },
  "Contacted":       { bg: "#1e2a4a", text: "#60a5fa", border: "#3b5998" },
  "Replied":         { bg: "#1a3a2e", text: "#34d399", border: "#065f46" },
  "Meeting Booked":  { bg: "#2d1f4a", text: "#a78bfa", border: "#5b21b6" },
  "No Response":     { bg: "#2a2a1e", text: "#fbbf24", border: "#92400e" },
  "Not Interested":  { bg: "#2a1e1e", text: "#f87171", border: "#991b1b" },
  "Closed Won":      { bg: "#0d2e1a", text: "#4ade80", border: "#14532d" },
  "Closed Lost":     { bg: "#1f1f1f", text: "#6b7280", border: "#374151" },
};

export const CHANNEL_ICONS = {
  "Call": "📞", "Email": "✉️", "LinkedIn DM": "💼", "LinkedIn InMail": "📨",
  "SMS": "💬", "Twitter/X": "🐦", "Other": "📌",
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
      { id: 3, channel: "Email", date: "2026-02-20", note: "Cold email #1 sent", status: "Contacted" },
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
