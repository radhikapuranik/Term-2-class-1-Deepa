import { query } from "./db";

export interface OrderLine { sku_id: string; sku_name: string; distributor_id: string; distributor_name: string; qty: number; unit: string; status: string; note: string | null }

export async function orderLines(): Promise<{ runId: number | null; lines: OrderLine[] }> {
  const run = await query<{ id: number }>("SELECT id FROM runs WHERE status='ok' ORDER BY id DESC LIMIT 1");
  if (!run[0]) return { runId: null, lines: [] };
  const lines = await query<OrderLine>(
    `SELECT r.sku_id, s.sku_name, s.distributor_id, COALESCE(d.distributor_name, s.distributor_id) AS distributor_name,
            r.final_qty AS qty, s.unit_of_measure AS unit, r.decision_status AS status,
            (SELECT reason_text FROM decisions x WHERE x.recommendation_id=r.id AND x.undone=false ORDER BY x.id DESC LIMIT 1) AS note
     FROM recommendations r JOIN skus s ON s.sku_id=r.sku_id LEFT JOIN distributors d ON d.distributor_id=s.distributor_id
     WHERE r.run_id=$1 AND r.decision_status IN ('Approved','Edited') AND r.final_qty > 0
     ORDER BY s.distributor_id, r.sku_id`, [run[0].id]);
  return { runId: run[0].id, lines };
}

export const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"` : s;
};
