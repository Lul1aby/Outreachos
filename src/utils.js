/* Collision-free ID generator — survives across hot reloads */
let _idCounter = Date.now();
export function nextId() { return ++_idCounter; }

export function todayStr() { return new Date().toISOString().slice(0, 10); }

/* ── Time helpers ── */

const TERMINAL = new Set(["Not Interested"]);

export function lastTouchDate(prospect) {
  if (TERMINAL.has(prospect.status)) return null;
  const dates = prospect.touchpoints.map(t => t.date).sort();
  return dates.length ? dates[dates.length - 1] : prospect.createdAt;
}

export function daysSinceLast(prospect) {
  const last = lastTouchDate(prospect);
  if (!last) return null;
  return Math.floor((Date.now() - new Date(last + "T00:00:00").getTime()) / 86400000);
}

export function hoursSinceLast(prospect) {
  const last = lastTouchDate(prospect);
  if (!last) return null;
  return Math.floor((Date.now() - new Date(last + "T00:00:00").getTime()) / 3600000);
}

export function fmtDate(s) {
  if (!s) return "";
  const d = new Date(s.includes("T") ? s : s + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

export function stalenessColor(days) {
  if (days === null) return "#4b5563";
  if (days >= 30) return "#ef4444";
  if (days >= 15) return "#f97316";
  if (days >= 7) return "#fbbf24";
  return "#34d399";
}

export function stalenessLabel(days) {
  if (days === null) return "—";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

/* ── CSV ── */

export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const parseRow = (line) => {
    const result = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) { result.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    result.push(cur.trim());
    return result;
  };
  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).filter((l) => l.trim()).map(parseRow);
  return { headers, rows };
}

export function autoMapCSV(headers) {
  const mapping = {};
  const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, "");
  headers.forEach((h) => {
    const n = norm(h);
    if (n.includes("name") && !n.includes("company")) mapping.name = h;
    else if (n.includes("company") || n.includes("org")) mapping.company = h;
    else if (n.includes("title") || n.includes("role") || n.includes("position")) mapping.title = h;
    else if (n.includes("industry") || n.includes("sector")) mapping.industry = h;
    else if (n.includes("email") || n.includes("mail")) mapping.email = h;
    else if (n.includes("phone") || n.includes("tel") || n.includes("mobile")) mapping.phone = h;
    else if (n.includes("linkedin")) mapping.linkedin = h;
    else if (n.includes("status")) mapping.status = h;
    else if (n.includes("list") || n.includes("campaign") || n.includes("segment")) mapping.listName = h;
    else if (n.includes("note")) mapping.notes = h;
  });
  return mapping;
}

export function downloadTemplate() {
  const hdr = "name,company,title,industry,email,phone,linkedin,status,notes";
  const row = "Jane Smith,Acme Corp,VP of Sales,SaaS,jane@acme.com,+1 555-0000,linkedin.com/in/janesmith,Not Started,Met at SaaStr";
  const blob = new Blob([hdr + "\n" + row], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "prospects_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Validation ── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d\s().-]{7,20}$/;
const URL_RE = /^(https?:\/\/)?[\w.-]+\.\w{2,}/i;

export function validateProspect(p) {
  const errors = {};
  if (!p.name?.trim()) errors.name = "Name is required";
  else if (p.name.trim().length > 100) errors.name = "Name too long (max 100)";
  if (!p.company?.trim()) errors.company = "Company is required";
  else if (p.company.trim().length > 100) errors.company = "Company too long (max 100)";
  if (p.email && !EMAIL_RE.test(p.email)) errors.email = "Invalid email format";
  if (p.phone && !PHONE_RE.test(p.phone)) errors.phone = "Invalid phone format";
  if (p.linkedin && !URL_RE.test(p.linkedin)) errors.linkedin = "Invalid URL";
  return Object.keys(errors).length ? errors : null;
}
