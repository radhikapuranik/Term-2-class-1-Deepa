import { query } from "@/lib/db";
import { dateTimeIst } from "@/lib/format";
import { MarkRead } from "./mark-read";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alerts" };

export default async function Page() {
  const rows = await query<{ id: number; kind: string; message: string; created_at: string; read: boolean }>("SELECT id, kind, message, created_at, read FROM alerts ORDER BY id DESC LIMIT 50");
  return (
    <>
      <div className="page-head"><h1>Alerts</h1><MarkRead disabled={!rows.some((r) => !r.read)} /></div>
      <p className="muted" style={{ maxWidth: "64ch", marginBottom: 16 }}>Messages appear here when the Monday and Thursday alert email cannot be sent, with what to switch on in plain words.</p>
      {rows.length === 0 ? <div className="empty">No alerts. Everything that needed to be sent was sent.</div> : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
          {rows.map((r) => <li key={r.id} className="card" style={{ borderLeft: r.read ? undefined : "4px solid var(--stockout)" }}><div className="small muted">{dateTimeIst(r.created_at)}{r.read ? "" : " · new"}</div><div>{r.message}</div></li>)}
        </ul>
      )}
    </>
  );
}
