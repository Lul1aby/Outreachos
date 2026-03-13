import { useState, useMemo, useEffect, useRef } from "react";
import { useStore } from "../store";
import { supabase } from "../supabase";
import { STATUSES, INDUSTRIES, CSV_FIELDS } from "../constants";
import { validateProspect, parseCSV, autoMapCSV, downloadTemplate, todayStr } from "../utils";
import { Modal, Input, Select, Textarea } from "./ui";

const empty = { name: "", company: "", title: "", industry: "Enterprise", email: "", linkedin: "", phone: "", notes: "", listName: "", status: "Not Started" };

export default function AddProspect({ onClose }) {
  const { state, dispatch, allLists } = useStore();
  const [tab, setTab] = useState("single");
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState(null);

  /* Duplicate detection — single prospect */
  const duplicate = useMemo(() => {
    if (!form.name.trim() || !form.company.trim()) return null;
    const n = form.name.trim().toLowerCase();
    const c = form.company.trim().toLowerCase();
    const e = form.email.trim().toLowerCase();
    return state.prospects.find((p) =>
      (p.name.toLowerCase() === n && p.company.toLowerCase() === c) ||
      (e && p.email && p.email.toLowerCase() === e)
    ) || null;
  }, [form.name, form.company, form.email, state.prospects]);

  /* CSV state */
  const [csvStep, setCsvStep] = useState("upload");
  const [csvRaw, setCsvRaw] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvMapping, setCsvMapping] = useState({});
  const [csvListName, setCsvListName] = useState("");
  const [csvError, setCsvError] = useState("");
  const [crossUserDupes, setCrossUserDupes] = useState([]); // matches from /api/check-duplicates
  const [checkingDupes, setCheckingDupes] = useState(false);
  const [excludedRows, setExcludedRows] = useState(new Set()); // indices to skip on import

  /* Single prospect cross-user duplicate check */
  const [singleCrossDupe, setSingleCrossDupe] = useState(null);
  const [checkingSingle, setCheckingSingle] = useState(false);

  /* Debounced cross-user check for single prospect */
  const singleCheckTimer = useRef(null);
  useEffect(() => {
    setSingleCrossDupe(null);
    const hasIdentifier = form.email.trim() || form.phone.trim() || form.linkedin.trim();
    if (!hasIdentifier) return;
    clearTimeout(singleCheckTimer.current);
    singleCheckTimer.current = setTimeout(async () => {
      setCheckingSingle(true);
      try {
        const session = await supabase?.auth.getSession();
        const token = session?.data?.session?.access_token;
        const res = await fetch("/api/check-duplicates", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ prospects: [{ email: form.email, phone: form.phone, linkedin: form.linkedin, name: form.name, company: form.company }] }),
        });
        if (res.ok) {
          const body = await res.json();
          if (body.matches?.length > 0) setSingleCrossDupe(body.matches[0]);
        }
      } catch { /* fail silently */ }
      finally { setCheckingSingle(false); }
    }, 600);
    return () => clearTimeout(singleCheckTimer.current);
  }, [form.email, form.phone, form.linkedin]);

  function saveProspect() {
    const errs = validateProspect(form);
    if (errs) { setErrors(errs); return; }
    dispatch({ type: "ADD_PROSPECT", payload: { ...form, name: form.name.trim(), company: form.company.trim() } });
    onClose();
  }

  function handleCsvFile(file) {
    setCsvError("");
    const reader = new FileReader();
    reader.onload = (e) => {
      const { headers, rows } = parseCSV(e.target.result);
      if (!headers.length) { setCsvError("Could not parse CSV. Make sure the file has a header row."); return; }
      setCsvHeaders(headers);
      setCsvRaw(rows);
      setCsvMapping(autoMapCSV(headers));
      setCsvStep("map");
    };
    reader.readAsText(file);
  }

  const csvPreview = useMemo(() => {
    return csvRaw.slice(0, 100).map((row) => {
      const obj = {};
      CSV_FIELDS.forEach((f) => {
        const col = csvMapping[f.key];
        const idx = col ? csvHeaders.indexOf(col) : -1;
        let val = idx >= 0 ? row[idx] || "" : "";
        if (f.key === "status") val = "Not Started";
        if (f.key === "industry") val = INDUSTRIES.includes(val) ? val : "Enterprise";
        if (f.key === "listName" && !val && csvListName) val = csvListName;
        obj[f.key] = val;
      });
      return obj;
    }).filter((p) => p.name && p.company);
  }, [csvRaw, csvHeaders, csvMapping, csvListName]);

  /* CSV duplicate detection */
  const csvDuplicateCount = useMemo(() => {
    return csvPreview.filter((p) => {
      const n = p.name.toLowerCase(), c = p.company.toLowerCase(), e = p.email?.toLowerCase();
      return state.prospects.some((ex) =>
        (ex.name.toLowerCase() === n && ex.company.toLowerCase() === c) ||
        (e && ex.email && ex.email.toLowerCase() === e)
      );
    }).length;
  }, [csvPreview, state.prospects]);

  function commitCsv() {
    const toImport = csvPreview.filter((_, i) => !excludedRows.has(i));
    if (toImport.length === 0) return;
    dispatch({ type: "IMPORT_PROSPECTS", payload: toImport, meta: { listName: csvListName || null } });
    onClose();
  }

  async function goToPreview() {
    setCsvStep("preview");
    setCrossUserDupes([]);
    setCheckingDupes(true);
    try {
      const session = await supabase?.auth.getSession();
      const token = session?.data?.session?.access_token;
      const res = await fetch("/api/check-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ prospects: csvPreview.map((p) => ({ email: p.email, phone: p.phone, linkedin: p.linkedin, name: p.name, company: p.company })) }),
      });
      if (res.ok) {
        const body = await res.json();
        setCrossUserDupes(body.matches || []);
      }
    } catch { /* fail silently — don't block the user */ }
    finally { setCheckingDupes(false); }
  }

  /* Auto-exclude system duplicates when detected */
  useEffect(() => {
    if (crossUserDupes.length > 0) {
      const sysDupeIndices = new Set(crossUserDupes.map((m) => m.inputIndex));
      setExcludedRows(sysDupeIndices);
    }
  }, [crossUserDupes]);

  function resetCsv() {
    setCsvStep("upload"); setCsvRaw([]); setCsvHeaders([]); setCsvMapping({}); setCsvListName(""); setCrossUserDupes([]); setExcludedRows(new Set());
  }

  const upd = (key) => (e) => { setForm((f) => ({ ...f, [key]: e.target.value })); setErrors(null); };

  return (
    <Modal onClose={() => { resetCsv(); onClose(); }}>
      {/* Tab switcher */}
      <div className="tab-switcher">
        <button className={`tab-switch${tab === "single" ? " active" : ""}`} onClick={() => setTab("single")}>✏️ Single Prospect</button>
        <button className={`tab-switch${tab === "csv" ? " active" : ""}`} onClick={() => setTab("csv")}>⬆ Import CSV</button>
      </div>

      {/* Single */}
      {tab === "single" && (
        <>
          <div className="form-row">
            <Input label="Full Name *" value={form.name} onChange={upd("name")} placeholder="Jane Smith" error={errors?.name} />
            <Input label="Company *" value={form.company} onChange={upd("company")} placeholder="Acme Corp" error={errors?.company} />
          </div>
          {duplicate && (
            <div style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)", borderRadius: 8, padding: "9px 14px", fontSize: 13, color: "var(--warning)", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
              ⚠️ Possible duplicate — <strong>{duplicate.name}</strong> at <strong>{duplicate.company}</strong> already exists in your list ({duplicate.status}).
            </div>
          )}
          {singleCrossDupe && (
            <div style={{ background: "#2a1a1a", border: "1px solid #7f1d1d", borderRadius: 8, padding: "9px 14px", fontSize: 13, color: "#fca5a5", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
              🚨 <strong>Already in the system</strong> — <strong>{singleCrossDupe.matchedName}</strong> at <strong>{singleCrossDupe.matchedCompany}</strong> (owned by {singleCrossDupe.ownerEmail}) matches by {singleCrossDupe.field}. Adding this prospect may create duplicate work.
            </div>
          )}
          {checkingSingle && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Checking system for duplicates…</div>
          )}
          <div className="form-row">
            <Input label="Title" value={form.title} onChange={upd("title")} placeholder="VP of Sales" />
            <Select label="Industry" options={INDUSTRIES} value={form.industry} onChange={upd("industry")} />
          </div>
          <div className="form-row">
            <Input label="Email" type="email" value={form.email} onChange={upd("email")} placeholder="jane@acme.com" error={errors?.email} />
            <Input label="Phone" value={form.phone} onChange={upd("phone")} placeholder="+1 555-0000" error={errors?.phone} />
          </div>
          <Input label="LinkedIn URL" value={form.linkedin} onChange={upd("linkedin")} placeholder="linkedin.com/in/janesmith" error={errors?.linkedin} />
          <div className="form-group">
            <label className="form-label">List Name</label>
            <input list="list-opts" className="form-input" value={form.listName} onChange={upd("listName")} placeholder="e.g. SaaStr 2026, Cold Outbound Q1…" />
            <datalist id="list-opts">{allLists.map((l) => <option key={l} value={l} />)}</datalist>
          </div>
          <Select label="Initial Status" options={STATUSES} value={form.status} onChange={upd("status")} />
          <Textarea label="Notes" rows={3} value={form.notes} onChange={upd("notes")} placeholder="How did you find this prospect? Any context…" />
          <div className="flex gap-8 justify-end mt-8">
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={saveProspect}>Add Prospect</button>
          </div>
        </>
      )}

      {/* CSV import */}
      {tab === "csv" && (
        <>
          {/* Step indicators */}
          <div className="csv-steps">
            {["upload", "map", "preview"].map((s, i) => (
              <div key={s} className="flex items-center gap-8">
                <div className={`csv-step-dot${csvStep === s ? " active" : ["upload", "map", "preview"].indexOf(csvStep) > i ? " done" : ""}`}>{i + 1}</div>
                <span className={`csv-step-label${csvStep === s ? " active" : ""}`} style={{ textTransform: "capitalize" }}>{s}</span>
                {i < 2 && <span style={{ color: "var(--input-border)", fontSize: 17 }}>›</span>}
              </div>
            ))}
          </div>

          {/* Upload */}
          {csvStep === "upload" && (
            <>
              <div className="card mb-20" style={{ padding: 16 }}>
                <label className="form-label" style={{ color: "var(--primary-light)", fontWeight: 600 }}>
                  📋 List Name <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(applied to all imported prospects)</span>
                </label>
                <input list="csv-list-opts" className="form-input" value={csvListName} onChange={(e) => setCsvListName(e.target.value)} placeholder="e.g. SaaStr 2026, Cold Outbound Q2…" style={{ borderColor: csvListName ? "var(--primary)" : undefined }} />
                <datalist id="csv-list-opts">{allLists.map((l) => <option key={l} value={l} />)}</datalist>
                {allLists.length > 0 && (
                  <div className="flex gap-6 flex-wrap mt-8">
                    <span className="mono" style={{ fontSize: 14, color: "var(--text-muted)", alignSelf: "center" }}>Existing:</span>
                    {allLists.map((l) => <button key={l} onClick={() => setCsvListName(l)} className="dormant-chip" style={csvListName === l ? { borderColor: "var(--primary)", color: "var(--primary-light)", background: "var(--primary-bg)" } : {}}>{l}</button>)}
                  </div>
                )}
                {!csvListName && <div style={{ fontSize: 14, color: "var(--warning-alt)", marginTop: 8 }}>⚠ Recommended — helps you filter and manage this batch later</div>}
              </div>
              <div className="csv-dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCsvFile(f); }}
                onClick={() => document.getElementById("csv-file").click()}
              >
                <div style={{ fontSize: 34, marginBottom: 10 }}>📂</div>
                <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>Drop your CSV here or click to browse</div>
                <div style={{ fontSize: 14, color: "var(--text-muted)" }}>Supports .csv files · up to 10,000 rows</div>
                <input id="csv-file" type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) handleCsvFile(e.target.files[0]); }} />
              </div>
              {csvError && <div style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 8, padding: "10px 14px", fontSize: 14, color: "var(--danger)", marginBottom: 16 }}>{csvError}</div>}
              <div className="flex items-center justify-between card" style={{ padding: "12px 16px" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>Need a template?</div>
                  <div style={{ fontSize: 14, color: "var(--text-muted)" }}>Download our CSV template with all supported columns</div>
                </div>
                <button className="btn btn-ghost" onClick={downloadTemplate}>⬇ Template</button>
              </div>
            </>
          )}

          {/* Map */}
          {csvStep === "map" && (
            <>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Map Your Columns</div>
              <div className="flex items-center gap-10 mb-16">
                <div style={{ fontSize: 14, color: "var(--text-sec)" }}>Found <strong style={{ color: "var(--text)" }}>{csvRaw.length} rows</strong>. Match CSV columns to fields.</div>
                {csvListName && <span className="filter-pill" style={{ background: "var(--primary-bg)", borderColor: "var(--primary)" }}>📋 {csvListName}</span>}
              </div>
              <div className="flex flex-col gap-8 mb-20">
                {CSV_FIELDS.map((f) => (
                  <div key={f.key} className="flex items-center gap-10">
                    <div style={{ width: 130, flexShrink: 0, fontSize: 14, color: f.required ? "#a78bfa" : "var(--text-sec)", fontWeight: f.required ? 600 : 400 }}>
                      {f.label}{f.required && <span style={{ fontSize: 14, color: "var(--primary)", marginLeft: 3 }}>*</span>}
                    </div>
                    <select className="form-select" style={{ flex: 1, marginBottom: 0 }} value={csvMapping[f.key] || ""} onChange={(e) => setCsvMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))}>
                      <option value="">— skip —</option>
                      {csvHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                    {csvMapping[f.key] && <div className="mono truncate" style={{ fontSize: 14, color: "var(--text-dim)", width: 90 }}>e.g. {csvRaw[0]?.[csvHeaders.indexOf(csvMapping[f.key])] || "—"}</div>}
                  </div>
                ))}
              </div>
              {(!csvMapping.name || !csvMapping.company) && <div style={{ background: "#2a2a1e", border: "1px solid var(--warning-border)", borderRadius: 8, padding: "10px 14px", fontSize: 14, color: "var(--warning)", marginBottom: 14 }}>Name and Company are required.</div>}
              <div className="flex gap-8 justify-end">
                <button className="btn btn-ghost" onClick={() => setCsvStep("upload")}>← Back</button>
                <button className="btn btn-primary" disabled={!csvMapping.name || !csvMapping.company} onClick={goToPreview} style={(!csvMapping.name || !csvMapping.company) ? { opacity: 0.5, cursor: "not-allowed" } : {}}>Preview →</button>
              </div>
            </>
          )}

          {/* Preview */}
          {csvStep === "preview" && (
            <>
              <div className="flex items-center gap-10 mb-6">
                <div style={{ fontSize: 17, fontWeight: 700 }}>Review & Import</div>
                {csvListName && <span className="filter-pill" style={{ background: "var(--primary-bg)", borderColor: "var(--primary)" }}>📋 {csvListName}</span>}
              </div>

              {/* Summary line */}
              <div style={{ fontSize: 14, color: "var(--text-sec)", marginBottom: 10 }}>
                <strong style={{ color: "var(--success-bright)" }}>{csvPreview.length} valid prospects</strong> ready to import
                {csvRaw.length - csvPreview.length > 0 && <span style={{ color: "var(--warning)" }}> · {csvRaw.length - csvPreview.length} skipped (missing name/company)</span>}
                {csvDuplicateCount > 0 && <span style={{ color: "#fb923c" }}> · ⚠️ {csvDuplicateCount} already in your list</span>}
                {checkingDupes && <span style={{ color: "var(--text-muted)" }}> · checking system…</span>}
                {!checkingDupes && crossUserDupes.length > 0 && <span style={{ color: "#f87171" }}> · 🚨 {new Set(crossUserDupes.map((m) => m.inputIndex)).size} already in system</span>}
              </div>

              {/* Cross-user duplicate banner */}
              {!checkingDupes && crossUserDupes.length > 0 && (
                <div style={{ background: "#2a1a1a", border: "1px solid #7f1d1d", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#fca5a5", marginBottom: 14 }}>
                  <strong>🚨 System duplicates detected</strong> — the following prospects already exist in another user's account:
                  <ul style={{ margin: "6px 0 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
                    {crossUserDupes.slice(0, 8).map((m, i) => (
                      <li key={i} style={{ fontSize: 12, color: "#fca5a5" }}>
                        <strong>{csvPreview[m.inputIndex]?.name}</strong> — duplicate <strong>{m.field}</strong>
                        {m.field === "email" && <span> (<span style={{ fontFamily: "monospace" }}>{m.value}</span>)</span>}
                        {m.field === "phone" && <span> ({m.value})</span>}
                        {m.field === "linkedin" && <span> (linkedin)</span>}
                        {" "}matches <strong>{m.matchedName}</strong> at <strong>{m.matchedCompany}</strong>
                      </li>
                    ))}
                    {crossUserDupes.length > 8 && <li style={{ fontSize: 12, color: "var(--text-muted)" }}>…and {crossUserDupes.length - 8} more</li>}
                  </ul>
                </div>
              )}

              {/* Table */}
              <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10, marginBottom: 18 }}>
                <table className="table" style={{ marginTop: 0 }}>
                  <thead style={{ position: "sticky", top: 0, background: "var(--surface-alt)" }}>
                    <tr>
                      <th style={{ width: 32, padding: "12px 8px" }}>
                        <input type="checkbox" checked={excludedRows.size === 0} onChange={(e) => setExcludedRows(e.target.checked ? new Set() : new Set(csvPreview.map((_, i) => i)))} style={{ cursor: "pointer", accentColor: "var(--primary)" }} title="Include/exclude all" />
                      </th>
                      {["Name", "Company", "Title", "List", "Status"].map((h) => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.map((p, i) => {
                      const n = p.name.toLowerCase(), c = p.company.toLowerCase(), e = p.email?.toLowerCase();
                      const isOwnDup = state.prospects.some((ex) =>
                        (ex.name.toLowerCase() === n && ex.company.toLowerCase() === c) ||
                        (e && ex.email && ex.email.toLowerCase() === e)
                      );
                      const isSysDup = crossUserDupes.some((m) => m.inputIndex === i);
                      const isExcluded = excludedRows.has(i);
                      const rowBg = isExcluded ? "rgba(100,100,100,0.08)" : isSysDup ? "rgba(239,68,68,0.07)" : isOwnDup ? "rgba(251,146,60,.06)" : undefined;
                      return (
                        <tr key={i} style={{ cursor: "default", background: rowBg, opacity: isExcluded ? 0.5 : 1 }}>
                          <td onClick={(e) => e.stopPropagation()} style={{ padding: "8px" }}>
                            <input type="checkbox" checked={!isExcluded} onChange={() => setExcludedRows((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })} style={{ cursor: "pointer", accentColor: isSysDup ? "#ef4444" : "var(--primary)" }} />
                          </td>
                          <td style={{ fontWeight: 500 }}>
                            {p.name}
                            {isSysDup && <span title="Already exists in the system (another user)" style={{ marginLeft: 6, fontSize: 12, color: "#f87171" }}>🚨</span>}
                            {!isSysDup && isOwnDup && <span title="Already in your list" style={{ marginLeft: 6, fontSize: 12, color: "#fb923c" }}>⚠️</span>}
                          </td>
                          <td style={{ color: "var(--text-sec)" }}>{p.company}</td>
                          <td style={{ color: "var(--text-sec)" }}>{p.title || <span style={{ color: "var(--text-dim)" }}>—</span>}</td>
                          <td>{p.listName ? <span className="filter-pill" style={{ background: "var(--primary-bg)", borderColor: "var(--border-hover)" }}>{p.listName}</span> : <span style={{ color: "var(--text-dim)" }}>—</span>}</td>
                          <td><span className="badge" style={{ background: "#1a1a2e", color: "#6b7280", borderColor: "#2d2d4e" }}>Not Started</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              {(csvDuplicateCount > 0 || crossUserDupes.length > 0) && (
                <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                  {crossUserDupes.length > 0 && <span><span style={{ color: "#f87171" }}>🚨</span> Already in system (another user)</span>}
                  {csvDuplicateCount > 0 && <span><span style={{ color: "#fb923c" }}>⚠️</span> Already in your list</span>}
                </div>
              )}

              {/* Quick actions for duplicates */}
              {(crossUserDupes.length > 0 || csvDuplicateCount > 0) && (
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  {crossUserDupes.length > 0 && (
                    <button className="btn btn-sm" style={{ background: "#2a1a1a", border: "1px solid #7f1d1d", color: "#fca5a5", fontSize: 12 }}
                      onClick={() => { const sysDupeIndices = new Set(crossUserDupes.map((m) => m.inputIndex)); setExcludedRows((prev) => { const n = new Set(prev); sysDupeIndices.forEach((i) => n.add(i)); return n; }); }}>
                      Exclude all system duplicates
                    </button>
                  )}
                  {excludedRows.size > 0 && (
                    <button className="btn btn-sm btn-ghost" style={{ fontSize: 12 }} onClick={() => setExcludedRows(new Set())}>
                      Include all
                    </button>
                  )}
                </div>
              )}

              <div className="flex gap-8 justify-end">
                <button className="btn btn-ghost" onClick={() => setCsvStep("map")}>← Back</button>
                <button className="btn btn-primary" onClick={commitCsv} disabled={csvPreview.length - excludedRows.size === 0}
                  style={csvPreview.length - excludedRows.size === 0 ? { opacity: 0.5, cursor: "not-allowed" } : {}}>
                  ⬆ Import {csvPreview.length - excludedRows.size} Prospect{csvPreview.length - excludedRows.size !== 1 ? "s" : ""}
                  {excludedRows.size > 0 && <span style={{ opacity: 0.7, marginLeft: 4 }}>({excludedRows.size} skipped)</span>}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
