import { csvCell, orderLines } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function GET() {
  const { runId, lines } = await orderLines();
  const head = ["Distributor_ID", "Distributor_Name", "SKU_ID", "SKU_Name", "Quantity", "Unit", "Decision", "Note"];
  const rows = lines.map((l) => [l.distributor_id, l.distributor_name, l.sku_id, l.sku_name, l.qty, l.unit, l.status, l.note ?? ""].map(csvCell).join(","));
  return new Response([head.join(","), ...rows].join("\n") + "\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="order-sheet-run-${runId ?? 0}.csv"` },
  });
}
