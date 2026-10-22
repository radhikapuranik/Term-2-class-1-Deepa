"use server";
import { revalidatePath } from "next/cache";
import { guard } from "@/lib/security";
import { pushDrafts, type PushReport } from "@/lib/zohoOrders";

export async function sendToZoho(name: string): Promise<PushReport> {
  const g = await guard(name, "zoho", 6, 3600);
  if (!g.ok) return { ok: false, message: g.error, results: [], unmatched: [] };
  const r = await pushDrafts(g.who);
  revalidatePath("/orders");
  return r;
}
