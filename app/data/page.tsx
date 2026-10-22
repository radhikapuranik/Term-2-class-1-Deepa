import { Uploader } from "./uploader";
import { currentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { dateTimeIst, dateIst, ago } from "@/lib/format";
import { weekMondayIso } from "@/lib/weeks";

export const dynamic = "force-dynamic";
export const metadata = { title: "Data" };

export default async function Page() {
  const [user, hist, fresh] = await Promise.all([
    currentUser(),
    query<{ id: number; source: string; created_at: string; counts: Record<string, number>; status: string; errors: string[] }>("SELECT id, source, created_at, counts, status, errors FROM import_batches ORDER BY id DESC LIMIT 15"),
    query<{ week: string | null; as_of: string | null; age: number | null }>("SELECT (SELECT max(week) FROM weekly_sales) AS week, (SELECT to_char(max(as_of_date),'YYYY-MM-DD') FROM inventory_snapshots) AS as_of, (SELECT (current_date - max(as_of_date))::int FROM inventory_snapshots) AS age"),
  ]);
  const f = fresh[0];
  const age = f.age;
  const level = age == null ? "bad" : age > 10 ? "bad" : age > 4 ? "warn" : "good";
  return (
    <>
      <h1 style={{ font: "700 2rem var(--f-display)" }}>Data</h1>
      <p className="muted" style={{ maxWidth: "64ch", margin: "8px 0 20px" }}>Raghav uploads CSV exports here, or IT pushes the same files to the ingest address each time the SAP export runs. There is no live SAP connection: SAP exports files, and this page or <code className="mono">POST /api/ingest</code> receives them.</p>
      <div className={`banner ${level}`} aria-live="polite"><b>Freshness:</b> stock as of {f.as_of ? dateIst(f.as_of) : "unknown"}{age != null && ` (${age} days old)`}, latest sales week {f.week ?? "none"}{f.week && ` (Monday ${dateIst(weekMondayIso(f.week))})`}.</div>
      <div className="grid">
        <section className="col-8 card"><h2 style={{ marginBottom: 12 }}>Upload CSV files</h2><Uploader signedIn={!!user} /></section>
        <aside className="col-4 card">
          <h2>Automatic push (for IT)</h2>
          <p className="small muted">Send the CSV text with the ingest token, after each SAP export:</p>
          <pre className="mono small" style={{ whiteSpace: "pre-wrap", background: "var(--shade)", padding: 10, borderRadius: 8 }}>{`curl -X POST $APP_URL/api/ingest \\
 -H "Authorization: Bearer $INGEST_TOKEN" \\
 -F sales=@weekly_sales.csv \\
 -F inventory=@current_inventory.csv`}</pre>
          <p className="small muted">A bad file is refused whole and nothing is saved. A good push triggers a fresh analysis.</p>
        </aside>
      </div>
      <h2 style={{ margin: "28px 0 10px" }}>Import history</h2>
      {hist.length === 0 ? <div className="empty">No imports yet.</div> : (
        <table className="tbl stack"><caption className="sr">Imports</caption>
          <thead><tr><th>When</th><th>Source</th><th>Rows</th><th>Status</th></tr></thead>
          <tbody>{hist.map((h) => <tr key={h.id}><td data-label="When" className="small">{dateTimeIst(h.created_at)} <span className="muted">({ago(h.created_at)})</span></td><td data-label="Source">{h.source}</td><td data-label="Rows" className="mono small">{Object.entries(h.counts).map(([k, v]) => `${k} ${v}`).join(", ")}</td><td data-label="Status">{h.status === "ok" ? "✓ saved" : `✕ failed${h.errors[0] ? `: ${h.errors[0]}` : ""}`}</td></tr>)}</tbody></table>
      )}
    </>
  );
}
