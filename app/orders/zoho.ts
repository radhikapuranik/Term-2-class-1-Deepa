"use server";
import { revalidatePath } from "next/cache";
import { blocked } from "@/lib/kill";
import { guard } from "@/lib/security";
import { reconcileOpen, zohoReady } from "@/lib/zohoSync";

type R = { ok: boolean; message: string };

async function run(name: string, createMissing: boolean): Promise<R> {
  const g = await guard(name, "zoho", 20, 3600);
  if (!g.ok) return { ok: false, message: g.error };
  const off = await blocked("zoho");
  if (off) return { ok: false, message: off };
  if (!zohoReady()) return { ok: false, message: "Zoho Inventory is not connected yet. The Zoho client keys and ZOHO_ORG_ID must be filled in first." };
  await reconcileOpen({ createMissing });
  revalidatePath("/orders");
  return { ok: true, message: createMissing ? "Done. Missing vendors and items were created, and the drafts were updated." : "Zoho drafts updated. Check the status on each line." };
}

/** Manual fallback: re-sync every approved line into draft purchase orders. */
export async function sendToZoho(name: string): Promise<R> { return run(name, false); }
/** Only called after the user has said yes to creating the listed vendors and items. */
export async function createMissingInZoho(name: string): Promise<R> { return run(name, true); }
