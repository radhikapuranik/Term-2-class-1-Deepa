"use server";
import { revalidatePath } from "next/cache";
import { reviveKill, setKill } from "@/lib/kill";
import { guard } from "@/lib/security";

export async function killSwitch(reason: string, name: string): Promise<{ ok: boolean; message: string }> {
  const g = await guard(name, "kill", 10, 3600);
  if (!g.ok) return { ok: false, message: g.error };
  if (reason.trim().length < 5) return { ok: false, message: "Please give a reason (5 letters or more)." };
  await setKill(reason, g.who);
  revalidatePath("/", "layout");
  return { ok: true, message: "Demand Desk is switched off." };
}

export async function switchBackOn(name: string): Promise<{ ok: boolean; message: string }> {
  const g = await guard(name, "kill", 10, 3600);
  if (!g.ok) return { ok: false, message: g.error };
  await reviveKill(g.who);
  revalidatePath("/", "layout");
  return { ok: true, message: "Demand Desk is switched back on." };
}
