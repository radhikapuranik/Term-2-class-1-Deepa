import { RulesForm } from "./form";
import { currentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { loadSettings } from "@/lib/store";
import { festivalMonths } from "@/lib/queries";
import { dateTimeIst, monthName } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rules" };

export default async function Page() {
  const [settings, user, cal, hist] = await Promise.all([
    loadSettings(), currentUser(), festivalMonths(),
    query<{ key: string; old_value: unknown; new_value: unknown; reason: string; changed_by: string; changed_at: string }>(
      "SELECT key, old_value, new_value, reason, changed_by, changed_at FROM settings_history ORDER BY id DESC LIMIT 30"),
  ]);
  const fest = cal.filter((c) => c.is_festival_month).map((c) => c.year_month);
  const months = [...new Set(fest.map((f) => monthName(f)))].join(", ");
  return (
    <>
      <h1 style={{ font: "700 2rem var(--f-display)" }}>Rules</h1>
      <p className="muted" style={{ maxWidth: "62ch", margin: "8px 0 20px" }}>These are Raghav&apos;s rules, written as numbers anyone can read and change. Every change is logged. Festival months come from the calendar file ({months || "none set"}).</p>
      <div className="card"><RulesForm settings={settings} signedIn={!!user} /></div>
      <h2 style={{ margin: "28px 0 10px" }}>Change history</h2>
      {hist.length === 0 ? <div className="empty">No changes yet. The rules are the defaults from the brief.</div> : (
        <table className="tbl stack"><caption className="sr">Rule changes</caption>
          <thead><tr><th>When</th><th>Rule</th><th>Old</th><th>New</th><th>Who</th><th>Why</th></tr></thead>
          <tbody>{hist.map((h, i) => <tr key={i}><td data-label="When" className="small">{dateTimeIst(h.changed_at)}</td><td data-label="Rule" className="mono small">{h.key}</td><td data-label="Old" className="mono">{String(h.old_value)}</td><td data-label="New" className="mono"><b>{String(h.new_value)}</b></td><td data-label="Who">{h.changed_by}</td><td data-label="Why">{h.reason}</td></tr>)}</tbody></table>
      )}
    </>
  );
}
