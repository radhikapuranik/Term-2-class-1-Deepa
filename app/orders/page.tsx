import Link from "next/link";
import { SendToZoho } from "@/components/SendToZoho";
import { PrintButton } from "@/components/PrintButton";
import { orderLines } from "@/lib/orders";
import { n0 } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orders" };

export default async function Page() {
  const { runId, lines } = await orderLines();
  const groups = new Map<string, typeof lines>();
  for (const l of lines) groups.set(l.distributor_id, [...(groups.get(l.distributor_id) ?? []), l]);
  return (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ font: "700 2rem var(--f-display)" }}>Order sheet</h1>
        <div className="no-print" style={{ display: "flex", gap: 8 }}>
          <a className="btn primary" href="/orders/csv" download>Download CSV</a><PrintButton />
        </div>
      </div>
      <p className="muted" style={{ maxWidth: "64ch", margin: "8px 0 20px" }}>Approved lines (and edited ones, which are approvals with a changed quantity), grouped by distributor. Quantities are in units. This sheet is a draft. Send to Zoho creates DRAFT purchase orders only; a person reviews and confirms them in Zoho. Demand Desk never places an order.</p>
      {lines.length === 0 ? (
        <div className="empty"><h2>No approved lines yet</h2><p>Approve recommendations on <Link href="/">Today</Link> and they appear here.</p></div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <SendToZoho />
          {[...groups].map(([id, ls]) => (
            <section key={id} className="card" aria-labelledby={`d-${id}`}>
              <h2 id={`d-${id}`}>{ls[0].distributor_name} <span className="sku-code" style={{ display: "inline" }}>{id}</span></h2>
              <table className="tbl stack" style={{ marginTop: 10 }}>
                <caption className="sr">Order lines for {ls[0].distributor_name}</caption>
                <thead><tr><th>SKU</th><th className="r">Quantity</th><th>Decision</th><th>Note</th></tr></thead>
                <tbody>{ls.map((l) => <tr key={l.sku_id}><td data-label="SKU">{l.sku_name.replace("Freshroots ", "")} <span className="sku-code">{l.sku_id}</span></td><td data-label="Quantity" className="r mono"><b>{n0(l.qty)}</b> {l.unit.toLowerCase()}</td><td data-label="Decision">{l.status}</td><td data-label="Note" className="small muted">{l.note ?? ""}</td></tr>)}</tbody>
                <tfoot><tr><td data-label="Total" colSpan={1}><b>Total</b></td><td data-label="Units" className="r mono"><b>{n0(ls.reduce((a, l) => a + l.qty, 0))}</b> units</td><td /><td /></tr></tfoot>
              </table>
            </section>
          ))}
          <p className="small muted">Run #{runId}. {lines.length} lines, {groups.size} distributor(s), {n0(lines.reduce((a, l) => a + l.qty, 0))} units in total.</p>
        </div>
      )}
    </>
  );
}
