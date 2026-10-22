import { query, transaction } from "./db";
import { runEngine } from "./rules/engine";
import type { EngineOutput, SkuResult } from "./rules/types";
import { loadDataset, loadSettings } from "./store";
import { MAX_EXPLAINED, explainOne, templateExplanation } from "./gemini";
import { sendDigest } from "./email";
import { blocked } from "./kill";

type Statement = { text: string; params?: unknown[] };

export function resultToRow(r: SkuResult) {
  const { trace, exceptions, borderline, ...metrics } = r;
  return { metrics, flags: { borderline, exceptions }, trace };
}

/** Runs the rule engine on the saved data and stores one recommendation per SKU. */
export async function runAnalysis(trigger: "seed" | "manual" | "cron" | "ingest", opts: { upliftOverride?: boolean | null } = {}) {
  const notify = trigger !== "seed";
  if (notify) { const off = await blocked("run"); if (off) throw new Error(off); }
  const [run] = await query<{ id: number }>(
    "INSERT INTO runs (trigger_type, status, stage) VALUES ($1,'running','analysing') RETURNING id", [trigger]);
  try {
    const [ds, settings] = await Promise.all([loadDataset(), loadSettings()]);
    const out = runEngine({ ...ds, settings, upliftOverride: opts.upliftOverride });
    await saveRun(run.id, out);
    if (notify) {
      await setStage(run.id, "explaining");
      await explainAll(run.id, out);
      await setStage(run.id, "emailing");
      const mail = await sendDigest(out, run.id);
      await query("UPDATE runs SET email_status=$2, email_attempts=$3, stage='done' WHERE id=$1",
        [run.id, mail.ok ? "sent" : `failed: ${mail.error ?? "unknown"}`, mail.attempts]);
    }
    return { runId: run.id, out };
  } catch (e) {
    await query("UPDATE runs SET status='failed', error=$2, finished_at=now() WHERE id=$1", [run.id, (e as Error).message.slice(0, 500)]);
    throw e;
  }
}

const rank = (r: SkuResult) => (r.urgent ? 0 : r.action === "review" ? 1 : r.status === "stockout" ? 2 : r.status === "exception" ? 3 : r.action === "pause" ? 4 : 5) * 1000 + (r.cover ?? 999);
const setStage = (id: number, stage: string) => query("UPDATE runs SET stage=$2 WHERE id=$1", [id, stage]);

/** Gemini explains the exceptions only. A failure here never stops the run. */
async function explainAll(runId: number, out: EngineOutput) {
  const flagged = out.results.filter((r) => r.exceptions.length > 0)
    .sort((a, b) => rank(a) - rank(b));
  const counts = { ai: 0, cache: 0, fallback: 0 };
  const deadline = Date.now() + 35_000;
  const queue = flagged.slice();
  const worker = async () => {
    for (let r = queue.shift(); r; r = queue.shift()) {
      const idx = flagged.indexOf(r);
      let outcome;
      try {
        outcome = idx >= MAX_EXPLAINED || Date.now() > deadline
          ? { value: templateExplanation(r), status: "fallback" as const }
          : await explainOne(r, out.upliftApplied);
      } catch {
        outcome = { value: templateExplanation(r), status: "fallback" as const };
      }
      counts[outcome.status]++;
      await query("UPDATE recommendations SET ai_explanation=$3, ai_status=$4 WHERE run_id=$1 AND sku_id=$2",
        [runId, r.sku_id, JSON.stringify(outcome.value), outcome.status === "fallback" ? "fallback" : "ai"]);
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
  await query("UPDATE runs SET ai_counts=$2 WHERE id=$1", [runId, JSON.stringify(counts)]);
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
