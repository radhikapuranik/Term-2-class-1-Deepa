"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { applyDecision, undoDecision, type DecideInput } from "@/lib/decisions";
import { query } from "@/lib/db";

export async function decide(recId: number, input: DecideInput) {
  const who = await requireUser().catch(() => null);
  if (!who) return { ok: false as const, error: "Sign in with the passcode first." };
  const res = await applyDecision(recId, input, who);
  if (res.ok) { revalidatePath("/"); revalidatePath("/orders"); revalidatePath("/exceptions"); }
  return res;
}

export async function undo(decisionId: number) {
  const who = await requireUser().catch(() => null);
  if (!who) return { ok: false as const, error: "Sign in with the passcode first." };
  const res = await undoDecision(decisionId);
  revalidatePath("/"); revalidatePath("/orders"); revalidatePath("/exceptions");
  return res;
}

export async function bulkApprove(recIds: number[]) {
  const who = await requireUser().catch(() => null);
  if (!who) return { ok: false as const, error: "Sign in with the passcode first.", done: [] as { id: number; decisionId: number; status: string; finalQty: number | null }[], skipped: 0 };
  const done: { id: number; decisionId: number; status: string; finalQty: number | null }[] = [];
  let skipped = 0;
  for (const id of recIds.slice(0, 200)) {
    const r = await applyDecision(id, { kind: "approve" }, who);
    if (r.ok) done.push({ id, decisionId: r.decisionId, status: r.status, finalQty: r.finalQty }); else skipped++;
  }
  revalidatePath("/"); revalidatePath("/orders");
  return { ok: true as const, done, skipped };
}

export async function addComment(skuId: string, body: string) {
  const who = await requireUser().catch(() => null);
  if (!who) return { ok: false as const, error: "Sign in with the passcode first." };
  const text = body.trim().slice(0, 500);
  if (!text) return { ok: false as const, error: "Write a comment first." };
  await query("INSERT INTO comments (sku_id, body, author) VALUES ($1,$2,$3)", [skuId, text, who]);
  revalidatePath(`/sku/${skuId}`);
  return { ok: true as const };
}
