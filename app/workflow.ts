"use server";
import { revalidatePath } from "next/cache";
import { applyDecision, undoDecision, type DecideInput } from "@/lib/decisions";
import { query } from "@/lib/db";
import { guard } from "@/lib/security";

const refresh = () => { revalidatePath("/"); revalidatePath("/orders"); revalidatePath("/exceptions"); revalidatePath("/recommendations"); };

export async function decide(recId: number, input: DecideInput, name: string) {
  const g = await guard(name);
  if (!g.ok) return { ok: false as const, error: g.error };
  const res = await applyDecision(recId, input, g.who);
  if (res.ok) refresh();
  return res;
}

export async function undo(decisionId: number, name: string) {
  const g = await guard(name);
  if (!g.ok) return { ok: false as const, error: g.error };
  const res = await undoDecision(decisionId);
  refresh();
  return res;
}

type Bulk = { ok: true; done: { id: number; decisionId: number; status: string; finalQty: number | null }[]; skipped: number } | { ok: false; error: string };

async function bulk(recIds: number[], input: DecideInput, name: string): Promise<Bulk> {
  const g = await guard(name, "bulk", 10, 60);
  if (!g.ok) return { ok: false, error: g.error };
  const done: { id: number; decisionId: number; status: string; finalQty: number | null }[] = [];
  let skipped = 0;
  for (const id of recIds.slice(0, 200)) {
    const r = await applyDecision(id, input, g.who);
    if (r.ok) done.push({ id, decisionId: r.decisionId, status: r.status, finalQty: r.finalQty }); else skipped++;
  }
  refresh();
  return { ok: true, done, skipped };
}

export async function bulkApprove(recIds: number[], name: string) { return bulk(recIds, { kind: "approve" }, name); }
export async function bulkDisapprove(recIds: number[], reasonCode: string, reasonText: string, name: string) { return bulk(recIds, { kind: "disapprove", reasonCode, reasonText }, name); }

export async function addComment(skuId: string, body: string, name: string) {
  const g = await guard(name);
  if (!g.ok) return { ok: false as const, error: g.error };
  const text = body.trim().slice(0, 500);
  if (!text) return { ok: false as const, error: "Write a comment first." };
  await query("INSERT INTO comments (sku_id, body, author) VALUES ($1,$2,$3)", [skuId, text, g.who]);
  revalidatePath(`/sku/${skuId}`);
  return { ok: true as const };
}
