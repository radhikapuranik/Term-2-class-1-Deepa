"use server";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { rateLimit } from "@/lib/security";

export async function markAllRead() {
  if (!(await rateLimit("alerts", 30, 60)).ok) return;
  await query("UPDATE alerts SET read=true WHERE read=false");
  revalidatePath("/", "layout");
}
