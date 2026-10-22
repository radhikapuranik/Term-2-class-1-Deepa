import { query } from "@/lib/db";
import { staleBacktest } from "@/lib/backtest";
import { exportLight, median, overrideLight, type Light, type WeekRate } from "@/lib/impact";
import { n0 } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Impact" };

const LIGHT: Record<Light, { word: string; cls: string; dot: string }> = {
  good: { word: "On track", cls: "good", dot: "●" }, warn: { word: "Watch", cls: "warn", dot: "▲" },
  bad: { word: "Kill criterion hit", cls: "bad", dot: "■" }, unknown: { word: "Not enough data yet", cls: "", dot: "○" },
};

export default async function Page() {
  const [weekly, totals, tta, batches, fresh, sales, runs] = await Promise.all([
    query<{ week: string; overridden: number; decided: number }>(`SELECT to_char(date_trunc('week', decided_at),'YYYY-MM-DD') AS week,
      count(*) FILTER (WHERE decision='Overridden')::int AS overridden, count(*) FILTER (WHERE decision IN ('Approved','Edited','Overridden'))::int AS decided
      FROM decisions WHERE undone=false GROUP BY 1 ORDER BY 1`),
    query<{ approved: number; edited: number; overridden: number; deferred: number }>(`SELECT
      count(*) FILTER (WHERE decision='Approved')::int AS approved, count(*) FILTER (WHERE decision='Edited')::int AS edited,
      count(*) FILTER (WHERE decision='Overridden')::int AS overridden, count(*) FILTER (WHERE decision='Deferred')::int AS deferred FROM decisions WHERE undone=false`),
    query<{ h: number }>(`SELECT extract(epoch FROM (d.decided_at - r.started_at))/3600 AS h FROM decisions d JOIN recommendations x ON x.id=d.recommendation_id JOIN runs r ON r.id=x.run_id WHERE d.undone=false AND d.decision<>'Deferred'`),
    query<{ status: string }>("SELECT status FROM import_batches WHERE source<>'seed' ORDER BY id DESC LIMIT 10"),
    query<{ age: number | null }>("SELECT (current_date - max(as_of_date))::int AS age FROM inventory_snapshots"),
    query<{ sku_id: string; week: string; units_sold: number }>("SELECT sku_id, week, units_sold FROM weekly_sales"),
    query<{ n: number }>("SELECT count(*)::int AS n FROM runs WHERE status='ok' AND started_at > now() - interval '30 days' AND trigger_type<>'seed'"),
  ]);
  const t = totals[0];
  const acted = t.approved + t.edited + t.overridden;
  const pct = (n: number) => (acted ? `${Math.round((n / acted) * 100)}%` : "–");
  const med = median(tta.map((x) => Number(x.h)));
  const ov = overrideLight(weekly as WeekRate[]);
  const ex = exportLight(batches, fresh[0]?.age ?? null);
  const bt = staleBacktest(sales);
  const tiles: { title: string; light: Light; detail: string; rule: string }[] = [
    { title: "Override rate", light: ov.light, detail: ov.detail, rule: "Kill if more than 40% of recommendations are overridden for 4 weeks in a row." },
    { title: "Data export reliability", light: ex.light, detail: ex.detail, rule: "Kill if the SAP export cannot be made reliable by about day 30." },
    { title: "Back-test vs Raghav's history", light: "unknown", detail: "This needs Raghav's past forecasts and what actually sold, which are not in the sample data. The panel below is a different, simpler test.", rule: "Kill if the back-test shows the rules are no better than his history." },
  ];
  return (
    <>
      <h1 style={{ font: "700 2rem var(--f-display)" }}>Impact</h1>
      <p className="muted" style={{ maxWidth: "64ch", margin: "8px 0 20px" }}>The measurement plan, live. Check at day 30, 60 and 90. Festival months (Oct, Nov, Mar) distort comparisons, so compare with the same months last year or matched SKUs.</p>

      <h2 style={{ marginBottom: 10 }}>Kill criteria</h2>
      <div className="tiles">
        {tiles.map((x) => (
          <div key={x.title} className={`banner ${LIGHT[x.light].cls}`} style={{ display: "block", margin: 0 }}>
            <div className="label">{x.title}</div>
            <div style={{ font: "700 1.3rem var(--f-display)", margin: "6px 0" }}><span aria-hidden="true">{LIGHT[x.light].dot}</span> {LIGHT[x.light].word}</div>
            <div className="small">{x.detail}</div>
            <div className="small muted" style={{ marginTop: 8 }}>{x.rule}</div>
          </div>
        ))}
      </div>

      <hr className="rule" />
      <div className="grid">
        <section className="col-6 card">
          <h2>Baseline versus now</h2>
          <table className="tbl" style={{ marginTop: 10 }}>
            <caption className="sr">Baseline versus now</caption>
            <thead><tr><th>Measure</th><th>Baseline</th><th>Now</th></tr></thead>
            <tbody>
              <tr><td>Planning cycle</td><td>Monthly <em className="muted small">(brief)</em></td><td className="mono">{n0(runs[0].n)} runs in 30 days</td></tr>
              <tr><td>Data age at decision</td><td>3 to 4 weeks <em className="muted small">(brief)</em></td><td className="mono">{fresh[0]?.age ?? "–"} days</td></tr>
              <tr><td>Planner data work</td><td>About 2 days a month <em className="muted small">(brief)</em></td><td className="muted small">Not measured: Raghav reports his hours at day 30, 60, 90. Target: about 2 hours.</td></tr>
              <tr><td>Planning losses</td><td>Rs 28 to 34 lakh a quarter <em className="muted small">(brief)</em></td><td className="muted small">Not measured. Needs stockout and write-off records.</td></tr>
              <tr><td>Rules cover</td><td>80 to 85% of recommendations <em className="muted small">(brief)</em></td><td className="mono">{acted ? `${pct(t.approved + t.edited)} accepted or edited` : "no decisions yet"}</td></tr>
            </tbody>
          </table>
          <p className="small muted" style={{ marginTop: 10 }}>Baseline numbers come from the case brief, not measured. Forecast accuracy and incident counts are unknown and must be back-tested.</p>
        </section>
        <section className="col-6 card">
          <h2>Decisions so far</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 12 }}>
            <div><div className="kpi">{pct(t.approved)}</div><div className="small muted">approved as is</div></div>
            <div><div className="kpi">{pct(t.edited)}</div><div className="small muted">quantity edited</div></div>
            <div><div className="kpi">{pct(t.overridden)}</div><div className="small muted">overridden</div></div>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>{acted} decisions in total, {t.deferred} deferred. Median time from run to decision: {med == null ? "–" : med < 1 ? `${Math.round(med * 60)} min` : `${med.toFixed(1)} h`}.</p>
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }} aria-labelledby="stale">
        <h2 id="stale">What stale data costs</h2>
        {bt ? (
          <>
            <p className="muted" style={{ maxWidth: "64ch" }}>Forecast each of the last {bt.weeksTested.length} weeks ({bt.weeksTested[0]} to {bt.weeksTested[bt.weeksTested.length - 1]}) for all {bt.skus} SKUs, using only the plain {bt.window}-week average of data that was 1 week old, then 4 weeks old.</p>
            <div style={{ display: "flex", gap: 32, flexWrap: "wrap", margin: "14px 0" }}>
              <div><div className="kpi" style={{ color: "var(--ok)" }}>{bt.freshErrPct.toFixed(1)}%</div><div className="small muted">average error with 1-week-old data</div></div>
              <div><div className="kpi" style={{ color: "var(--stockout)" }}>{bt.staleErrPct.toFixed(1)}%</div><div className="small muted">average error with 4-week-old data</div></div>
            </div>
            <p className="small muted">Simple back-test on sample data. Error = units missed ÷ units sold. Today&apos;s monthly cycle means decisions rest on data about 4 weeks old; a twice-weekly run keeps it about 1 week old or less.</p>
          </>
        ) : <div className="empty">Not enough sales history for the back-test.</div>}
      </section>
    </>
  );
}
