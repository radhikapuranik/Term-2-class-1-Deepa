import { describe, expect, it, vi } from "vitest";
import { makeDb } from "./fakedb";

const rec = { sku_id: "SKU003", action: "reorder", qty: 300, decision_status: "Recommended", final_qty: null as number | null, run_id: 5 };
const decisions: { id: number; decision: string; final_qty: number | null; reason_code: string | null; decided_by: string; prev_status: string }[] = [];
const undoRow = { recommendation_id: 1, undone: false, prev_status: "Recommended", prev_qty: null as number | null };
const db = makeDb([
  (t) => (t.includes("FROM decisions WHERE id=$1") ? [undoRow] : undefined),
  (t) => (t.includes("FROM recommendations WHERE id=$1") ? [rec] : undefined),
  (t) => (t.includes("FROM runs WHERE status='ok'") ? [{ id: 5 }] : undefined),
  (t, p) => {
    if (t.includes("INSERT INTO decisions")) { decisions.push({ id: decisions.length + 1, decision: String(p[2]), final_qty: p[3] as number | null, reason_code: p[4] as string | null, decided_by: String(p[6]), prev_status: String(p[7]) }); return [{ id: decisions.length }]; }
  },
  (t, p) => { if (t.includes("UPDATE recommendations SET decision_status")) { rec.decision_status = String(p[1]); rec.final_qty = p[2] as number | null; return []; } },
]);
vi.mock("@/lib/db", () => ({ query: (t: string, p?: unknown[]) => db.query(t, p ?? []), transaction: async () => [] }));

import { applyDecision, undoDecision } from "@/lib/decisions";
import { overrideRate } from "@/lib/impact";

describe("Approve / Disapprove flow", () => {
  it("approve keeps the recommended quantity and logs name and time", async () => {
    const r = await applyDecision(1, { kind: "approve" }, "Raghav");
    expect(r).toMatchObject({ ok: true, status: "Approved", finalQty: 300 });
    expect(decisions.at(-1)?.decided_by).toBe("Raghav");
  });
  it("disapprove needs a reason from the list and orders nothing", async () => {
    expect((await applyDecision(1, { kind: "disapprove", reasonCode: "" }, "R")).ok).toBe(false);
    const r = await applyDecision(1, { kind: "disapprove", reasonCode: "Shelf-life concern", reasonText: "short dated" }, "R");
    expect(r).toMatchObject({ ok: true, status: "Disapproved", finalQty: 0 });
    expect(decisions.at(-1)?.reason_code).toBe("Shelf-life concern");
  });
  it("approve is refused when there is no recommended quantity", async () => {
    const saved = rec.qty; (rec as { qty: number | null }).qty = null;
    const r = await applyDecision(1, { kind: "approve" }, "R");
    (rec as { qty: number | null }).qty = saved;
    expect(r.ok).toBe(false);
  });
  it("edit needs a reason; defer needs none", async () => {
    expect((await applyDecision(1, { kind: "edit", qty: 450, reason: "" }, "R")).ok).toBe(false);
    expect(await applyDecision(1, { kind: "edit", qty: 450, reason: "festival" }, "R")).toMatchObject({ status: "Edited", finalQty: 450 });
    expect(await applyDecision(1, { kind: "defer" }, "R")).toMatchObject({ status: "Deferred" });
  });
  it("undo restores the previous status and quantity", async () => {
    rec.decision_status = "Recommended"; rec.final_qty = null;
    await applyDecision(1, { kind: "approve" }, "R");
    expect(rec.decision_status).toBe("Approved");
    undoRow.prev_status = decisions.at(-1)!.prev_status;
    const r = await undoDecision(decisions.length);
    expect(r).toMatchObject({ ok: true, status: "Recommended" });
    expect(rec.decision_status).toBe("Recommended");
  });
  it("override rate = (disapproved + edited) / decided", () => {
    expect(overrideRate({ approved: 6, edited: 2, disapproved: 2 })).toBeCloseTo(0.4);
    expect(overrideRate({ approved: 0, edited: 0, disapproved: 0 })).toBeNull();
  });
});
