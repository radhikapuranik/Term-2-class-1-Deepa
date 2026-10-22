import { query } from "./db";
import type { DecisionStatus } from "./queries";

import { OVERRIDE_REASONS } from "./decisions-shared";

export type DecideInput =
  | { kind: "approve" }
  | { kind: "edit"; qty: number; reason: string }
  | { kind: "override"; reasonCode: string; reasonText?: string }
  | { kind: "defer"; reason?: string };

const STATUS: Record<DecideInput["kind"], DecisionStatus> = { approve: "Approved", edit: "Edited", override: "Overridden", defer: "Deferred" };

export async function applyDecision(recId: number, input: DecideInput, who: string): Promise<{ ok: true; decisionId: number; status: DecisionStatus; finalQty: number | null } | { ok: false; error: string }> {
  const rows = await query<{ sku_id: string; action: string; qty: number | null; decision_status: DecisionStatus; final_qty: number | null; run_id: number }>(
    "SELECT sku_id, action, qty, decision_status, final_qty, run_id FROM recommendations WHERE id=$1", [recId]);
  const rec = rows[0];
  if (!rec) return { ok: false, error: "That recommendation no longer exists." };
  const latest = await query<{ id: number }>("SELECT id FROM runs WHERE status='ok' ORDER BY id DESC LIMIT 1");
  if (latest[0]?.id !== rec.run_id) return { ok: false, error: "A newer run exists. Refresh the page to see current recommendations." };

  let finalQty: number | null = null;
  let reasonCode: string | null = null;
  let reasonText: string | null = null;
  if (input.kind === "approve") {
    if (rec.action === "review") return { ok: false, error: "This SKU has conflicting signals and no quantity. Edit the quantity, override, or defer." };
    finalQty = rec.qty;
  } else if (input.kind === "edit") {
    if (!Number.isInteger(input.qty) || input.qty < 0 || input.qty > 1_000_000) return { ok: false, error: "Quantity must be a whole number from 0 up." };
    if (input.reason.trim().length < 3) return { ok: false, error: "Please give a short reason for the edit." };
    finalQty = input.qty; reasonCode = "edit"; reasonText = input.reason.trim().slice(0, 300);
  } else if (input.kind === "override") {
    if (!(OVERRIDE_REASONS as readonly string[]).includes(input.reasonCode)) return { ok: false, error: "Pick a reason from the list." };
    finalQty = 0; reasonCode = input.reasonCode; reasonText = (input.reasonText ?? "").trim().slice(0, 300) || null;
  } else {
    reasonCode = "defer"; reasonText = input.reason?.trim().slice(0, 300) || null;
  }
  const status = STATUS[input.kind];
  const d = await query<{ id: number }>(
    `INSERT INTO decisions (recommendation_id, sku_id, decision, final_qty, reason_code, reason_text, decided_by, prev_status, prev_qty)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [recId, rec.sku_id, status, finalQty, reasonCode, reasonText, who, rec.decision_status, rec.final_qty]);
  await query("UPDATE recommendations SET decision_status=$2, final_qty=$3 WHERE id=$1", [recId, status, finalQty]);
  return { ok: true, decisionId: Number(d[0].id), status, finalQty };
}

export async function undoDecision(decisionId: number): Promise<{ ok: boolean; error?: string; recId?: number; status?: DecisionStatus; finalQty?: number | null }> {
  const rows = await query<{ recommendation_id: number; undone: boolean; prev_status: DecisionStatus | null; prev_qty: number | null }>(
    "SELECT recommendation_id, undone, prev_status, prev_qty FROM decisions WHERE id=$1", [decisionId]);
  const d = rows[0];
  if (!d) return { ok: false, error: "Decision not found." };
  if (d.undone) return { ok: false, error: "Already undone." };
  const status = d.prev_status ?? "Recommended";
  await query("UPDATE decisions SET undone=true WHERE id=$1", [decisionId]);
  await query("UPDATE recommendations SET decision_status=$2, final_qty=$3 WHERE id=$1", [d.recommendation_id, status, d.prev_qty]);
  return { ok: true, recId: Number(d.recommendation_id), status, finalQty: d.prev_qty };
}

export async function overridePatterns() {
  return query<{ reason: string; n: number }>(
    `SELECT COALESCE(NULLIF(reason_code,''),'none') AS reason, count(*)::int AS n FROM decisions
     WHERE undone=false AND decision IN ('Overridden','Edited') GROUP BY 1 ORDER BY n DESC`);
}
