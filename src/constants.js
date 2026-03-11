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

