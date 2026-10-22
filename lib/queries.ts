import { query } from "./db";
import { loadDataset, loadSettings } from "./store";
import { runEngine } from "./rules/engine";
import type { SkuResult, TraceLine } from "./rules/types";

export interface Run {
  id: number; trigger_type: string; status: string; stage: string; as_of: string | null; uplift_applied: boolean | null;
  warnings: string[]; summary: Record<string, number> | null; error: string | null; started_at: string; finished_at: string | null;
}
export type DecisionStatus = "Recommended" | "Approved" | "Edited" | "Disapproved" | "Deferred";
export interface Rec extends Omit<SkuResult, "trace"> {
  id: number | null; run_id: number; category: string; unit_of_measure: string; decision_status: DecisionStatus;
  final_qty: number | null; ai_explanation: { plain_explanation: string; question_for_planner: string; watch_out: string } | null;
  ai_status: string; trace?: TraceLine[];
}

export async function latestRun(): Promise<Run | null> {
  const r = await query<Run>(
    `SELECT id, trigger_type, status, stage, to_char(as_of,'YYYY-MM-DD') AS as_of, uplift_applied, warnings, summary, error, started_at, finished_at
     FROM runs WHERE status='ok' ORDER BY id DESC LIMIT 1`);
  return r[0] ?? null;
}

const REC_SQL = `SELECT r.id, r.run_id, r.decision_status, r.final_qty, r.ai_explanation, r.ai_status, r.metrics, r.flags, s.category, s.unit_of_measure
  FROM recommendations r JOIN skus s ON s.sku_id = r.sku_id`;

type Row = {
  id: number; run_id: number; decision_status: DecisionStatus; final_qty: number | null; ai_explanation: Rec["ai_explanation"];
  ai_status: string; metrics: Record<string, unknown>; flags: { borderline: string[]; exceptions: SkuResult["exceptions"] };
  category: string; unit_of_measure: string; rule_trace?: TraceLine[];
};
const toRec = (x: Row): Rec => ({
  ...(x.metrics as unknown as Omit<SkuResult, "trace" | "exceptions" | "borderline">),
  borderline: x.flags.borderline, exceptions: x.flags.exceptions, id: x.id, run_id: x.run_id,
  decision_status: x.decision_status, final_qty: x.final_qty, ai_explanation: x.ai_explanation, ai_status: x.ai_status,
  category: x.category, unit_of_measure: x.unit_of_measure, trace: x.rule_trace,
});

export async function recsForRun(runId: number): Promise<Rec[]> {
  const rows = await query<Row>(`${REC_SQL} WHERE r.run_id = $1 ORDER BY r.sku_id`, [runId]);
  return rows.map(toRec);
}

export async function recForSku(runId: number, skuId: string): Promise<Rec | null> {
  const rows = await query<Row>(`SELECT r.rule_trace, ${REC_SQL.slice(7)} WHERE r.run_id = $1 AND r.sku_id = $2`, [runId, skuId]);
  return rows[0] ? toRec(rows[0]) : null;
}

/** Live "what if" view that is not saved (used for the festival uplift switch). */
export async function previewRecs(uplift: boolean): Promise<Rec[]> {
  const [ds, settings] = await Promise.all([loadDataset(), loadSettings()]);
  const out = runEngine({ ...ds, settings, upliftOverride: uplift });
  const cat = new Map(ds.skus.map((s) => [s.sku_id, s]));
  return out.results.map((r) => ({
    ...r, id: null, run_id: 0, category: cat.get(r.sku_id)?.category ?? "", unit_of_measure: cat.get(r.sku_id)?.unit_of_measure ?? "Units",
    decision_status: "Recommended" as const, final_qty: null, ai_explanation: null, ai_status: "none",
  }));
}

export async function isDemoData(): Promise<boolean> {
  const r = await query<{ source: string }>("SELECT source FROM import_batches WHERE status='ok' ORDER BY id DESC LIMIT 1");
  return !r[0] || r[0].source === "seed";
}

export const urgencyRank = (r: Rec) =>
  (r.urgent ? 0 : r.action === "review" ? 1 : r.status === "stockout" ? 2 : r.status === "exception" ? 3 : r.action === "pause" ? 4 : 5) * 1000 + (r.cover ?? 999);

export async function salesFor(skuId: string) {
  return query<{ week: string; units_sold: number }>("SELECT week, units_sold FROM weekly_sales WHERE sku_id=$1 ORDER BY week", [skuId]);
}
export async function festivalMonths() {
  return query<{ year_month: string; is_festival_month: boolean }>("SELECT year_month, is_festival_month FROM calendar ORDER BY year_month");
}

export async function totalSales() {
  return query<{ week: string; units_sold: number }>("SELECT week, sum(units_sold)::int AS units_sold FROM weekly_sales GROUP BY week ORDER BY week");
}
