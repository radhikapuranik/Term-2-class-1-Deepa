"use client";
import { useState, useTransition } from "react";
import { checkFiles, saveFiles } from "./actions";
import type { Report } from "@/lib/importer";
import type { CsvKind } from "@/lib/csv";

const SLOTS: { k: CsvKind; label: string; cols: string }[] = [
  { k: "sales", label: "weekly_sales.csv", cols: "SKU_ID, Week, Units_Sold" },
  { k: "inventory", label: "current_inventory.csv", cols: "SKU_ID, Location, Units_On_Hand, As_Of_Date" },
  { k: "skus", label: "sku_master.csv", cols: "SKU_ID, SKU_Name, Category, Perishability, Standard_Reorder_Qty, Unit_of_Measure, Distributor_ID" },
  { k: "distributors", label: "distributor_master.csv", cols: "Distributor_ID, Distributor_Name, Region, Status" },
  { k: "calendar", label: "calendar.csv", cols: "Year, Month, Year_Month, Is_Festival_Month" },
];

export function Uploader({ signedIn }: { signedIn: boolean }) {
  const [texts, setTexts] = useState<Partial<Record<CsvKind, string>>>({});
  const [report, setReport] = useState<Report | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const count = Object.keys(texts).length;
  return (
    <div>
      <div style={{ display: "grid", gap: 12 }}>
        {SLOTS.map((s) => (
          <div key={s.k}>
            <label htmlFor={`f-${s.k}`}>{s.label} <span className="muted">(columns: {s.cols})</span></label>
            <input id={`f-${s.k}`} type="file" accept=".csv,text/csv" onChange={async (e) => {
              const f = e.target.files?.[0];
              setReport(null); setSaved(false);
              setTexts((t) => { const n = { ...t }; if (!f) delete n[s.k]; return n; });
              if (f) { const text = await f.text(); setTexts((t) => ({ ...t, [s.k]: text })); }
            }} />
          </div>
        ))}
      </div>
      <p className="small muted">Upload any of the files. A weekly refresh usually needs only sales and inventory. Nothing is saved until the check passes and you confirm.</p>
      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <button className="btn" disabled={!count || pending} onClick={() => start(async () => { setSaved(false); setReport(await checkFiles(texts)); })}>1. Check files</button>
        <button className="btn primary" disabled={!report?.ok || !signedIn || pending || saved} onClick={() => start(async () => { const r = await saveFiles(texts); setReport(r); setSaved(r.ok); })}>2. Save and run analysis</button>
      </div>
      {!signedIn && <p className="small muted" style={{ marginTop: 8 }}>You can check files without signing in. Saving needs the desk passcode.</p>}
      <div aria-live="polite" style={{ marginTop: 16 }}>
        {report?.fatal && <div className="banner bad" role="alert">{report.fatal}</div>}
        {saved && report?.ok && <div className="banner good">Saved and analysed (run #{report.runId}). The dashboard now shows your data.</div>}
        {report && report.files.length > 0 && (
          <table className="tbl stack"><caption>Validation report{report.ok && !saved ? ": all files are readable" : ""}</caption>
            <thead><tr><th>File</th><th className="r">Rows</th><th>Problems</th></tr></thead>
            <tbody>{report.files.map((f) => (
              <tr key={f.kind}><td data-label="File" className="mono small">{f.kind}</td><td data-label="Rows" className="r mono">{f.rows}</td>
                <td data-label="Problems" className="small">{f.errors.length === 0 && f.warnings.length === 0 ? "None" : <>
                  {f.errors.map((e, i) => <div key={i} style={{ color: "var(--stockout)" }}>✕ {e}</div>)}
                  {f.warnings.map((e, i) => <div key={i} className="muted">! {e}</div>)}</>}</td></tr>))}</tbody></table>
        )}
        {report && report.crossIssues.length > 0 && <div className="banner warn" style={{ marginTop: 12, display: "block" }}><b>Across files:</b><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{report.crossIssues.map((c, i) => <li key={i}>{c}</li>)}</ul><span className="small muted">These do not block saving; the affected SKUs go to Exceptions.</span></div>}
      </div>
    </div>
  );
}
