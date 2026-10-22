import Link from "next/link";
import { Hero } from "@/components/Hero";
import { Banners } from "@/components/DeskBanners";
import { Badge, CoverBar, StatusBadges, actionText, reasonLine, GLOSSARY, Term } from "@/components/ui";
import { isDemoData, latestRun, previewRecs, recsForRun, urgencyRank } from "@/lib/queries";
import { n0 } from "@/lib/format";

export const dynamic = "force-dynamic";

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
  const decided = recs.filter((r) => !open(r)).length;
  return (
    <>
      <Banners run={run} demo={demo} upliftOff={upliftOff} basePath="/" />
      <Hero count={needs.length} total={recs.length}
        label={`${stock} at stockout risk, ${over} overstocked, ${high} with rising demand. ${decided} already decided. Nothing is ordered until a person approves it.`} />
      <div className="chips" role="list" aria-label="Status counts">
        <Link role="listitem" className="chip" href="/recommendations?status=stockout"><Badge kind="stockout">Stockout risk</Badge> <b>{stock}</b></Link>
        <Link role="listitem" className="chip" href="/recommendations?status=high"><Badge kind="high">High demand</Badge> <b>{high}</b></Link>
        <Link role="listitem" className="chip" href="/recommendations?status=overstock"><Badge kind="over">Overstock</Badge> <b>{over}</b></Link>
        <Link role="listitem" className="chip" href="/recommendations?status=ok"><Badge kind="ok">OK</Badge> <b>{ok}</b></Link>
        <Link role="listitem" className="chip" href="/exceptions"><Badge kind="exception">Exceptions</Badge> <b>{excWaiting.length}</b></Link>
      </div>

      <hr className="rule" />
      <div className="grid">
        <section className="col-8" aria-labelledby="needs">
          <h2 id="needs">Needs a decision</h2>
          <p className="muted small">Most urgent first. <Term tip={GLOSSARY.cover}>Weeks of cover</Term> bars show today (▮) and after the order (◯) against the safe zone.</p>
          {needs.length === 0 ? <div className="empty">Nothing needs a decision. Stock looks healthy.</div> : (
            <table className="tbl stack">
              <caption className="sr">SKUs that need a decision</caption>
              <thead><tr><th>SKU</th><th>Status</th><th>Cover</th><th>Recommendation</th></tr></thead>
              <tbody>
                {needs.slice(0, 8).map((r) => (
                  <tr key={r.sku_id}>
                    <td data-label="SKU"><Link className="sku-link" href={`/sku/${r.sku_id}`}>{r.sku_name.replace("Freshroots ", "")}</Link><span className="sku-code">{r.sku_id}</span></td>
                    <td data-label="Status"><StatusBadges r={r} /></td>
                    <td data-label="Cover" style={{ minWidth: 150 }}><CoverBar cover={r.cover} after={r.coverAfter} min={r.minWeeks} max={r.maxWeeks} /></td>
                    <td data-label="Recommendation"><b>{actionText(r)}</b>{r.decision_status !== "Recommended" && <> <span className="badge b-decision">{r.decision_status}</span></>}<div className="small muted">{reasonLine(r)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
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
    </>
  );
}
