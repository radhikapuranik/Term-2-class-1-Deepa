import { DecisionQueue } from "@/components/DecisionQueue";
import { overridePatterns } from "@/lib/decisions";
import { latestRun, recsForRun } from "@/lib/queries";
import { query } from "@/lib/db";
import { dateTimeIst } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Exceptions" };

export default async function Page() {
  const [run, patterns] = await Promise.all([latestRun(), overridePatterns()]);
  if (!run) return <div className="empty">No analysis yet.</div>;
  const recs = (await recsForRun(run.id)).filter((r) => r.exceptions.length > 0).sort((a, b) => (a.decision_status === "Recommended" ? 0 : 1) - (b.decision_status === "Recommended" ? 0 : 1));
  const log = await query<{ sku_id: string; decision: string; final_qty: number | null; reason_code: string | null; reason_text: string | null; decided_by: string; decided_at: string }>(
    "SELECT sku_id, decision, final_qty, reason_code, reason_text, decided_by, decided_at FROM decisions WHERE undone=false ORDER BY id DESC LIMIT 15");
  const total = patterns.reduce((a, p) => a + p.n, 0);
  return (
    <>
      <h1 style={{ font: "700 2rem var(--f-display)" }}>Exceptions</h1>
      <p className="muted" style={{ maxWidth: "62ch", margin: "8px 0 20px" }}>The cases the rules cannot settle alone. The code finds them; the planner decides and says why. Every decision is saved to the log.</p>
      <div className="grid">
        <section className="col-8" aria-labelledby="q">
          <h2 id="q" className="sr">Queue</h2>
          {recs.length === 0 ? <div className="empty">No exceptions in this run.</div> : <DecisionQueue recs={recs} variant="cards" />}
        </section>
        <aside className="col-4">
          <h2>Patterns in disapprovals and edits</h2>
          <p className="small muted">When the planner edits or disapproves, the reason is counted here. Repeated reasons are candidates to become rules.</p>
          {total === 0 ? <div className="empty small">No edits or disapprovals yet.</div> : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {patterns.map((p) => (
                <li key={p.reason}><div style={{ display: "flex", justifyContent: "space-between" }} className="small"><span>{p.reason === "edit" ? "Quantity edited" : p.reason}</span><b className="mono">{p.n}</b></div>
                  <div style={{ height: 6, background: "var(--hair)", borderRadius: 3 }}><div style={{ height: 6, width: `${(p.n / total) * 100}%`, background: "var(--brand)", borderRadius: 3 }} /></div></li>
              ))}
            </ul>
          )}
          <h2 style={{ marginTop: 24 }}>Decision log</h2>
          {log.length === 0 ? <div className="empty small">No decisions yet.</div> : (
            <ul className="small" style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 8 }}>
              {log.map((l, i) => <li key={i}><b>{l.sku_id}</b> {l.decision}{l.final_qty != null ? ` (${l.final_qty})` : ""} by {l.decided_by}<div className="muted">{dateTimeIst(l.decided_at)}{l.reason_text ? ` · ${l.reason_text}` : l.reason_code && l.reason_code !== "edit" && l.reason_code !== "defer" ? ` · ${l.reason_code}` : ""}</div></li>)}
            </ul>
          )}
        </aside>
      </div>
    </>
  );
}
