import Link from "next/link";
import { Hero } from "@/components/Hero";
import { Banners } from "@/components/DeskBanners";
import { Badge, GLOSSARY, Term } from "@/components/ui";
import { festivalMonths, isDemoData, latestRun, previewRecs, recsForRun, totalSales, urgencyRank } from "@/lib/queries";
import { SalesChart } from "@/components/SalesChart";
import { query } from "@/lib/db";
import { n0 } from "@/lib/format";
import { RunNow } from "@/components/RunNow";
import { DecisionQueue } from "@/components/DecisionQueue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Today({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const upliftOff = sp.uplift === "off";
  const [run, demo] = await Promise.all([latestRun(), isDemoData()]);
  if (!run) return <div className="empty"><h2>No analysis yet</h2><p>Load data on the <Link href="/data">Data page</Link> and run the analysis.</p></div>;
  const recs = upliftOff ? await previewRecs(false) : await recsForRun(run.id);
  const open = (r: (typeof recs)[number]) => r.decision_status === "Recommended" || r.decision_status === "Deferred";
  const needs = recs.filter((r) => r.action === "reorder" || r.action === "pause" || r.action === "review" || r.status === "exception").sort((a, b) => urgencyRank(a) - urgencyRank(b));
  const stock = recs.filter((r) => r.status === "stockout").length;
  const over = recs.filter((r) => r.status === "overstock").length;
  const high = recs.filter((r) => r.highDemand).length;
  const ok = recs.filter((r) => r.status === "ok").length;
  const exc = recs.filter((r) => r.exceptions.length > 0 && r.status !== "ok" || r.action === "review");
  const excWaiting = recs.filter((r) => r.exceptions.length > 0 && open(r));
  const [totals, cal, dn] = await Promise.all([totalSales(), festivalMonths(), query<{ distributor_id: string; distributor_name: string }>("SELECT distributor_id, distributor_name FROM distributors")]);
  const fest = new Map(cal.map((c) => [c.year_month, c.is_festival_month]));
  const last12 = totals.slice(-12);
  const totalAvg = last12.length ? last12.reduce((a, b) => a + b.units_sold, 0) / last12.length : null;
  const names = new Map(dn.map((d) => [d.distributor_id, d.distributor_name]));
  const openNeeds = needs.filter(open);
  const byDistMap = new Map<string, { name: string; n: number }>();
  for (const r of openNeeds) byDistMap.set(r.distributor_id, { name: names.get(r.distributor_id) ?? "", n: (byDistMap.get(r.distributor_id)?.n ?? 0) + 1 });
  const byDist = [...byDistMap].sort((a, b) => b[1].n - a[1].n);
  const decided = recs.filter((r) => !open(r)).length;
  return (
    <>
      <Banners run={run} demo={demo} upliftOff={upliftOff} basePath="/" />
      <Hero count={needs.length} total={recs.length}
        label={`${stock} at stockout risk, ${over} overstocked, ${high} with rising demand. ${decided} already decided. Nothing is ordered until a person approves it.`} />
      <div style={{ marginBottom: 14 }}><RunNow /></div>
      <div className="kpis" role="list" aria-label="Status counts">
        {([
          ["/recommendations?status=stockout", "stockout", "Stockout risk", stock, "var(--stockout)"],
          ["/recommendations?status=high", "high", "High demand", high, "var(--high)"],
          ["/recommendations?status=overstock", "over", "Overstock", over, "var(--over)"],
          ["/recommendations?status=ok", "ok", "Healthy", ok, "var(--ok)"],
          ["/exceptions", "exception", "Exceptions waiting", excWaiting.length, "var(--ink)"],
        ] as const).map(([href, kind, label, n, color]) => (
          <Link key={label} role="listitem" href={href} className="kpi-card" style={{ ["--accent" as string]: color }}>
            <Badge kind={kind}>{label}</Badge>
            <div className="num">{n}</div>
            <div className="bar" aria-hidden="true"><i style={{ width: `${recs.length ? (n / recs.length) * 100 : 0}%` }} /></div>
          </Link>
        ))}
      </div>
      <div className="grid">
        <section className="col-8" aria-labelledby="needs">
          <h2 id="needs">Needs a decision</h2>
          <p className="muted small">Most urgent first. <Term tip={GLOSSARY.cover}>Weeks of cover</Term> bars show today (▮) and after the order (◯) against the safe zone.</p>
          {needs.length === 0 ? <div className="empty">Nothing needs a decision. Stock looks healthy.</div> : (
            <DecisionQueue recs={needs.slice(0, 8)} keyboard={!upliftOff} />
          )}
          {needs.length > 8 && <p style={{ marginTop: 12 }}><Link href="/recommendations">See all {needs.length} →</Link></p>}
        </section>
        <aside className="col-4" aria-labelledby="exc">
          <h2 id="exc">Exceptions waiting</h2>
          <p className="muted small"><Term tip={GLOSSARY.exception}>Exceptions</Term> are cases the rules cannot settle alone.</p>
          {excWaiting.length === 0 ? <div className="empty">None waiting.</div> : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
              {excWaiting.slice(0, 5).map((r) => (
                <li key={r.sku_id} className="card" style={{ padding: 12 }}>
                  <Link className="sku-link" href={`/sku/${r.sku_id}`}>{r.sku_name.replace("Freshroots ", "")}</Link> <span className="sku-code">{r.sku_id}</span>
                  <div className="small muted">{r.exceptions[0].message}</div>
                </li>
              ))}
            </ul>
          )}
          {excWaiting.length > 0 && <p style={{ marginTop: 12 }}><Link href="/exceptions">Open the queue ({excWaiting.length}) →</Link></p>}
          <p className="small muted" style={{ marginTop: 18 }}>{n0(exc.length)} flagged this run. {run.warnings.length > 0 && <b>{run.warnings[0]}</b>}</p>
        </aside>
      </div>

      <div className="grid" style={{ marginTop: 16 }}>
        <section className="col-8 card" aria-labelledby="trend">
          <div className="section-h"><h2 id="trend">Total weekly units, all SKUs</h2><span className="small muted">dashed: 12-week average</span></div>
          <SalesChart sales={totals} festival={fest} avg12={totalAvg} windowWeeks={12} title="Total weekly units sold across all SKUs" />
        </section>
        <section className="col-4 card" aria-labelledby="dist">
          <h2 id="dist">Open decisions by distributor</h2>
          <p className="small muted">SKUs waiting on a decision, grouped by who the order goes to.</p>
          <ul className="dlist">
            {byDist.map(([id, d]) => (
              <li key={id}><span><b>{id}</b> <span className="muted small">{d.name}</span></span><b className="mono">{d.n}</b>
                <span className="meter" aria-hidden="true"><i style={{ width: `${(d.n / Math.max(1, needs.length)) * 100}%` }} /></span></li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
