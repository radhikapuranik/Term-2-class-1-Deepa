import { AutoRefresh, SendToErp } from "@/components/ErpControls";
import { PrintButton } from "@/components/PrintButton";
import Link from "next/link";
import { orderLines, type OrderLine } from "@/lib/orders";
import { n0, dateTimeIst } from "@/lib/format";
import { erpReady, poLink, poReference } from "@/lib/erpSync";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orders" };

function chip(l: OrderLine, ready: boolean) {
  const s = l.erp_status;
  if (s === "draft") return <span className="badge b-ok" title="A draft purchase order exists in ERPNext">✓ Draft in ERPNext{l.po_name ? ` · ${l.po_name}` : ""}{l.po_name && <> · <a href={poLink(l.po_name)} target="_blank" rel="noreferrer">open</a></>}</span>;
  if (s === "pending") return <span className="badge b-decision">… Sending to ERPNext</span>;
  if (s === "failed") return <span className="badge b-stockout" title={l.erp_detail ?? ""}>✕ ERPNext failed: {l.erp_detail}</span>;
  if (s === "needs_yes") return <span className="badge b-high">! Needs your yes: {l.erp_detail}</span>;
  if (s === "paused") return <span className="badge b-exception">■ ERPNext paused (switched off)</span>;
  return <span className="badge b-borderline">{ready ? "Not in ERPNext" : "Not in ERPNext (not connected)"}</span>;
}

export default async function Page() {
  const { runId, lines } = await orderLines();
  const ready = erpReady();
  const groups = new Map<string, OrderLine[]>();
  for (const l of lines) groups.set(l.distributor_id, [...(groups.get(l.distributor_id) ?? []), l]);
  const missing = [...new Set(lines.flatMap((l) => (l.erp_status === "needs_yes" ? [l.erp_detail ?? ""] : [])))].filter(Boolean);
  const total = lines.reduce((a, l) => a + l.qty, 0);
  return (
    <>
      <AutoRefresh active={lines.some((l) => l.erp_status === "pending")} />
      <div className="page-head">
        <h1>Order sheet</h1>
        <div className="no-print" style={{ display: "flex", gap: 8 }}><a className="btn primary" href="/orders/csv" download>Download CSV</a><PrintButton /></div>
      </div>
      <p className="muted" style={{ maxWidth: "66ch", marginBottom: 18 }}>Every approved line (including edited quantities) appears here at once. When ERPNext is connected, each distributor gets one DRAFT purchase order; procurement reviews and submits it in ERPNext. Demand Desk never submits or sends a purchase order.</p>
      {lines.length === 0 ? (
        <div className="empty"><h2>No approved lines yet</h2><p>Approve a recommendation with a quantity on <Link href="/">Today</Link> and it appears here straight away. Disapproved, deferred and undone lines do not show.</p></div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <SendToErp missing={missing} />
          {[...groups].map(([id, ls]) => (
            <section key={id} className="card" aria-labelledby={`d-${id}`}>
              <h2 id={`d-${id}`}>{ls[0].distributor_name} <span className="sku-code" style={{ display: "inline" }}>{id} · {poReference(ls[0].order_run, id)}</span></h2>
              <table className="tbl stack" style={{ marginTop: 10 }}>
                <caption className="sr">Order lines for {ls[0].distributor_name}</caption>
                <thead><tr><th>SKU</th><th className="r">Quantity</th><th>Approved by</th><th>ERPNext</th></tr></thead>
                <tbody>{ls.map((l) => (
                  <tr key={l.rec_id}>
                    <td data-label="SKU">{l.sku_name.replace("Freshroots ", "")} <span className="sku-code">{l.sku_id}</span></td>
                    <td data-label="Quantity" className="r mono"><b>{n0(l.qty)}</b> {l.unit.toLowerCase()}{l.status === "Edited" && <span className="small muted"> (edited)</span>}</td>
                    <td data-label="Approved by" className="small">{l.approved_by ?? "–"}<div className="muted">{l.approved_at ? dateTimeIst(l.approved_at) : ""}</div></td>
                    <td data-label="ERPNext" className="small">{chip(l, ready)}</td>
                  </tr>))}</tbody>
                <tfoot><tr><td data-label="Total"><b>Total</b></td><td data-label="Units" className="r mono"><b>{n0(ls.reduce((a, l) => a + l.qty, 0))}</b> units</td><td /><td /></tr></tfoot>
              </table>
            </section>
          ))}
          <p className="small muted">Run #{runId}. {lines.length} lines, {groups.size} distributor(s), {n0(total)} units in total.</p>
        </div>
      )}
    </>
  );
}
