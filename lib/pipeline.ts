import { query, transaction } from "./db";
import { runEngine } from "./rules/engine";
import type { EngineOutput, SkuResult } from "./rules/types";
import { loadDataset, loadSettings } from "./store";

type Statement = { text: string; params?: unknown[] };

export function resultToRow(r: SkuResult) {
  const { trace, exceptions, borderline, ...metrics } = r;
  return { metrics, flags: { borderline, exceptions }, trace };
}

/** Runs the rule engine on the saved data and stores one recommendation per SKU. */
export async function runAnalysis(trigger: "seed" | "manual" | "cron" | "ingest", opts: { upliftOverride?: boolean | null } = {}) {
  const [run] = await query<{ id: number }>(
    "INSERT INTO runs (trigger_type, status, stage) VALUES ($1,'running','analysing') RETURNING id", [trigger]);
  try {
    const [ds, settings] = await Promise.all([loadDataset(), loadSettings()]);
    const out = runEngine({ ...ds, settings, upliftOverride: opts.upliftOverride });
    await saveRun(run.id, out);
    return { runId: run.id, out };
  } catch (e) {
    await query("UPDATE runs SET status='failed', error=$2, finished_at=now() WHERE id=$1", [run.id, (e as Error).message.slice(0, 500)]);
    throw e;
  }
}

async function saveRun(runId: number, out: EngineOutput) {
  const st: Statement[] = [];
  for (const r of out.results) {
    const row = resultToRow(r);
    st.push({
      text: `INSERT INTO recommendations (run_id, sku_id, status, action, qty, cover_after, high_demand, urgent, metrics, flags, rule_trace)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (run_id, sku_id) DO NOTHING`,
      params: [runId, r.sku_id, r.status, r.action, r.qty, r.coverAfter, r.highDemand, r.urgent,
        JSON.stringify(row.metrics), JSON.stringify(row.flags), JSON.stringify(row.trace)],
    });
    for (const e of r.exceptions) {
      st.push({
        text: `INSERT INTO exceptions (recommendation_id, sku_id, code, message)
               SELECT id, $2, $3, $4 FROM recommendations WHERE run_id=$1 AND sku_id=$2`,
        params: [runId, r.sku_id, e.code, e.message],
      });
    }
  }
  st.push({
    text: `UPDATE runs SET status='ok', stage='done', as_of=$2, uplift_applied=$3, warnings=$4, summary=$5, finished_at=now() WHERE id=$1`,
    params: [runId, out.asOf, out.upliftApplied, JSON.stringify(out.warnings), JSON.stringify(out.summary)],
  });
  await transaction(st);
}
