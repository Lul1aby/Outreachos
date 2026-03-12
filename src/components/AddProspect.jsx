import { useState, useMemo } from "react";
import { useStore } from "../store";
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
    dispatch({ type: "IMPORT_PROSPECTS", payload: csvPreview, meta: { listName: csvListName || null } });
    onClose();
  }

  function resetCsv() {
    setCsvStep("upload"); setCsvRaw([]); setCsvHeaders([]); setCsvMapping({}); setCsvListName("");
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
              ⚠️ Possible duplicate — <strong>{duplicate.name}</strong> at <strong>{duplicate.company}</strong> already exists ({duplicate.status}). You can still add if this is a different contact.
            </div>
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
                <button className="btn btn-primary" disabled={!csvMapping.name || !csvMapping.company} onClick={() => setCsvStep("preview")} style={(!csvMapping.name || !csvMapping.company) ? { opacity: 0.5, cursor: "not-allowed" } : {}}>Preview →</button>
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
              <div style={{ fontSize: 14, color: "var(--text-sec)", marginBottom: 14 }}>
                <strong style={{ color: "var(--success-bright)" }}>{csvPreview.length} valid prospects</strong> ready to import
                {csvRaw.length - csvPreview.length > 0 && <span style={{ color: "var(--warning)" }}> · {csvRaw.length - csvPreview.length} skipped</span>}
                {csvDuplicateCount > 0 && <span style={{ color: "#fb923c" }}> · ⚠️ {csvDuplicateCount} possible duplicate{csvDuplicateCount > 1 ? "s" : ""}</span>}
              </div>
              <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10, marginBottom: 18 }}>
                <table className="table" style={{ marginTop: 0 }}>
                  <thead style={{ position: "sticky", top: 0, background: "var(--surface-alt)" }}>
                    <tr>{["Name", "Company", "Title", "List", "Status"].map((h) => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {csvPreview.map((p, i) => {
                      const n = p.name.toLowerCase(), c = p.company.toLowerCase(), e = p.email?.toLowerCase();
                      const isDup = state.prospects.some((ex) =>
                        (ex.name.toLowerCase() === n && ex.company.toLowerCase() === c) ||
                        (e && ex.email && ex.email.toLowerCase() === e)
                      );
                      return (
                      <tr key={i} style={{ cursor: "default", background: isDup ? "rgba(251,146,60,.06)" : undefined }}>
                        <td style={{ fontWeight: 500 }}>{p.name}{isDup && <span title="Possible duplicate" style={{ marginLeft: 6, fontSize: 12, color: "#fb923c" }}>⚠️</span>}</td>
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
              <div className="flex gap-8 justify-end">
                <button className="btn btn-ghost" onClick={() => setCsvStep("map")}>← Back</button>
                <button className="btn btn-primary" onClick={commitCsv}>⬆ Import {csvPreview.length} Prospects</button>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
