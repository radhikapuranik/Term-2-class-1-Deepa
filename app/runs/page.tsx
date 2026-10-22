import { RunNow } from "@/components/RunNow";
import { currentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { ago, dateIst, dateTimeIst } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Runs" };

export default async function Page() {
  const [user, runs] = await Promise.all([currentUser(), query<{
    id: number; trigger_type: string; status: string; stage: string; as_of: string | null; error: string | null; started_at: string;
    finished_at: string | null; email_status: string | null; ai_counts: { ai: number; cache: number; fallback: number } | null; summary: Record<string, number> | null; warnings: string[];
  }>(`SELECT id, trigger_type, status, stage, to_char(as_of,'YYYY-MM-DD') AS as_of, error, started_at, finished_at, email_status, ai_counts, summary, warnings
      FROM runs ORDER BY id DESC LIMIT 40`)]);
  return (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ font: "700 2rem var(--f-display)" }}>Runs</h1><RunNow signedIn={!!user} />
      </div>
      <p className="muted" style={{ maxWidth: "64ch", margin: "8px 0 20px" }}>The analysis runs every Monday and Thursday at 08:00 IST, after each data push, and when you press Run now (once every 5 minutes at most). On the free Vercel plan the scheduled run may start anywhere inside its hour.</p>
      {runs.length === 0 ? <div className="empty">No runs yet.</div> : (
        <table className="tbl stack"><caption className="sr">Run history</caption>
          <thead><tr><th>Run</th><th>Started</th><th>Trigger</th><th>Status</th><th>Data as of</th><th>AI</th><th>Email</th></tr></thead>
          <tbody>{runs.map((r) => (
            <tr key={r.id}>
              <td data-label="Run" className="mono">#{r.id}</td>
              <td data-label="Started" className="small">{dateTimeIst(r.started_at)} <span className="muted">({ago(r.started_at)})</span></td>
              <td data-label="Trigger">{r.trigger_type}</td>
              <td data-label="Status">{r.status === "ok" ? "✓ ok" : r.status === "failed" ? <span style={{ color: "var(--stockout)" }}>✕ failed</span> : `… ${r.stage}`}{r.error && <div className="small muted">{r.error}</div>}{r.warnings.length > 0 && <div className="small muted">{r.warnings[0]}</div>}</td>
              <td data-label="Data as of" className="mono small">{r.as_of ? dateIst(r.as_of) : "–"}</td>
              <td data-label="AI" className="small">{r.ai_counts ? `${r.ai_counts.ai + r.ai_counts.cache} by Gemini${r.ai_counts.fallback ? `, ${r.ai_counts.fallback} unavailable` : ""}` : "–"}</td>
              <td data-label="Email" className="small">{r.email_status ?? "–"}</td>
            </tr>))}</tbody></table>
      )}
    </>
  );
}
