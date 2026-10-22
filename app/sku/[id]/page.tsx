import Link from "next/link";
import { notFound } from "next/navigation";
import { CoverBar, StatusBadges, actionText, reasonLine, Term, GLOSSARY } from "@/components/ui";
import { Receipt } from "@/components/Receipt";
import { SalesChart } from "@/components/SalesChart";
import { festivalMonths, isDemoData, latestRun, recForSku, salesFor } from "@/lib/queries";
import { loadSettings } from "@/lib/store";
import { Banners } from "@/components/DeskBanners";
import { n0, n1, dateTimeIst } from "@/lib/format";
import { DecisionQueue } from "@/components/DecisionQueue";
import { CommentForm } from "@/components/CommentForm";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page({ params }: PageProps<"/sku/[id]">) {
  const { id } = await params;
  const run = await latestRun();
  if (!run) notFound();
  const r = await recForSku(run.id, id.toUpperCase());
  if (!r) notFound();
  const [sales, cal, settings, demo, history, comments] = await Promise.all([
    salesFor(r.sku_id), festivalMonths(), loadSettings(), isDemoData(),
    query<{ decision: string; final_qty: number | null; reason_code: string | null; reason_text: string | null; decided_by: string; decided_at: string; undone: boolean }>(
      "SELECT decision, final_qty, reason_code, reason_text, decided_by, decided_at, undone FROM decisions WHERE sku_id=$1 ORDER BY id DESC LIMIT 20", [r.sku_id]),
    query<{ body: string; author: string; created_at: string }>("SELECT body, author, created_at FROM comments WHERE sku_id=$1 ORDER BY id DESC LIMIT 20", [r.sku_id]),
  ]);
  const fest = new Map(cal.map((c) => [c.year_month, c.is_festival_month]));
  const ann = r.status === "stockout" ? { text: `Stockout risk: ${n1(r.cover)} wks of cover`, kind: "stockout" as const }
    : r.status === "overstock" ? { text: `Overstock: ${n1(r.cover)} wks of cover`, kind: "overstock" as const }
    : r.cover != null ? { text: `OK: ${n1(r.cover)} wks of cover`, kind: "ok" as const } : undefined;
  return (
    <>
      <Banners run={run} demo={demo} basePath={`/sku/${r.sku_id}`} />
      <p className="small"><Link href="/recommendations">← All SKUs</Link></p>
      <header style={{ margin: "8px 0 20px" }}>
        <div className="label">{r.sku_id} · {r.category} · {r.distributor_id}{r.perishable ? " · perishable" : ""}</div>
        <h1 style={{ font: "700 clamp(1.8rem,4vw,2.8rem)/1.05 var(--f-display)", margin: "8px 0 10px" }}>{r.sku_name}</h1>
        <StatusBadges r={r} />
      </header>
      <div className="grid">
        <section className="col-8 card" aria-labelledby="rec">
          <h2 id="rec">{actionText(r)}</h2>
          <p className="muted">{reasonLine(r)}</p>
          <div style={{ margin: "18px 0 6px" }}><CoverBar large cover={r.cover} after={r.coverAfter} min={r.minWeeks} max={r.maxWeeks} /></div>
          {r.advisoryTopUp != null && <div className="banner warn" role="note" style={{ marginTop: 14 }}>Still below minimum after this order. Advisory only: an extra <b className="mono">{r.advisoryTopUp}</b> units would reach {r.minWeeks} weeks. Nothing is applied automatically.</div>}
          {r.exceptions.length > 0 && (
            <ul className="small" style={{ margin: "14px 0 0", paddingLeft: 18 }}>{r.exceptions.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
          )}
          <div style={{ marginTop: 16 }}><DecisionQueue recs={[r]} actionsOnly /></div>
        </section>
        <section className="col-4 card" aria-labelledby="nums">
          <h2 id="nums">The numbers</h2>
          <dl style={{ margin: "12px 0 0", display: "grid", gridTemplateColumns: "1fr auto", gap: "8px 12px" }} className="mono small">
            <dt><Term tip={GLOSSARY.avg12}>12-wk average</Term></dt><dd style={{ margin: 0, textAlign: "right" }}>{n1(r.avg12)}</dd>
            <dt>Last 4 wks average</dt><dd style={{ margin: 0, textAlign: "right" }}>{n1(r.avg4)}</dd>
            <dt><Term tip={GLOSSARY.festival}>Demand per week</Term></dt><dd style={{ margin: 0, textAlign: "right" }}>{n1(r.demand)}</dd>
            <dt>Stock on hand</dt><dd style={{ margin: 0, textAlign: "right" }}>{n0(r.onHand)} {r.unit_of_measure.toLowerCase()}</dd>
            <dt><Term tip={GLOSSARY.cover}>Weeks of cover</Term></dt><dd style={{ margin: 0, textAlign: "right" }}>{n1(r.cover)}</dd>
            <dt>Safe range</dt><dd style={{ margin: 0, textAlign: "right" }}>{r.minWeeks} to {r.maxWeeks} wks</dd>
            <dt>Cover after order</dt><dd style={{ margin: 0, textAlign: "right" }}>{n1(r.coverAfter)}</dd>
          </dl>
        </section>
        <section className="col-12 card" aria-labelledby="chart">
          <h2 id="chart">Weekly sales</h2>
          <p className="muted small">Dashed line: 12-week average. Shaded: last 4 weeks and festival months.</p>
          <SalesChart sales={sales} festival={fest} avg12={r.avg12} windowWeeks={12} annotation={ann} title={`Weekly sales for ${r.sku_name}`} />
        </section>
        <section className="col-6"><h2 style={{ marginBottom: 10 }}>Why (rule receipt)</h2>{r.trace && <Receipt skuId={r.sku_id} name={r.sku_name} trace={r.trace} asOf={run.as_of} />}</section>
        <section className="col-6">
          <h2 style={{ marginBottom: 10 }}>Explanation</h2>
          {r.ai_explanation ? (
            <div className="card"><p>{r.ai_explanation.plain_explanation}</p><p><b>Question for the planner:</b> {r.ai_explanation.question_for_planner}</p><p className="muted"><b>Watch out:</b> {r.ai_explanation.watch_out}</p><p className="small muted">Written by Gemini. Numbers come from the rule engine.</p></div>
          ) : <div className="empty small">No AI explanation for this SKU. It is only written for exceptions.</div>}
          <p className="small muted" style={{ marginTop: 12 }}>Limits in use: {settings.stockoutWeeksNormal} to {settings.overstockWeeksNormal} weeks (perishable {settings.stockoutWeeksPerishable} to {settings.overstockWeeksPerishable}). <Link href="/rules">Change rules</Link></p>
        </section>
        <section className="col-6 card" aria-labelledby="hist">
          <h2 id="hist">Decision history</h2>
          {history.length === 0 ? <p className="muted small">No decisions on this SKU yet.</p> : (
            <ul className="small" style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "grid", gap: 8 }}>
              {history.map((h, i) => <li key={i} style={{ opacity: h.undone ? 0.5 : 1 }}><b>{h.decision}</b>{h.final_qty != null && ` (${h.final_qty})`}{h.undone && " · undone"} by {h.decided_by}<div className="muted">{dateTimeIst(h.decided_at)}{h.reason_text ? ` · ${h.reason_text}` : h.reason_code && !["edit", "defer"].includes(h.reason_code) ? ` · ${h.reason_code}` : ""}</div></li>)}
            </ul>
          )}
        </section>
        <section className="col-6 card" aria-labelledby="cmt">
          <h2 id="cmt">Comments</h2>
          {comments.map((c, i) => <p key={i} className="small" style={{ margin: "10px 0 0" }}>{c.body}<span className="muted"> · {c.author}, {dateTimeIst(c.created_at)}</span></p>)}
          {comments.length === 0 && <p className="muted small">No comments yet.</p>}
          <div style={{ marginTop: 12 }}><CommentForm skuId={r.sku_id} /></div>
        </section>
      </div>
    </>
  );
}
