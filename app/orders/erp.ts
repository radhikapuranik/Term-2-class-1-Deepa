"use server";
import { revalidatePath } from "next/cache";
import { erpReady, reconcileOpen } from "@/lib/erpSync";
import { blocked } from "@/lib/kill";
import { guard } from "@/lib/security";

type R = { ok: boolean; message: string };

async function run(name: string, createMissing: boolean): Promise<R> {
  const g = await guard(name, "erp", 20, 3600);
  if (!g.ok) return { ok: false, message: g.error };
  const off = await blocked("erp");
  if (off) return { ok: false, message: off };
  if (!erpReady()) return { ok: false, message: "ERPNext is not connected yet. ERPNEXT_URL, ERPNEXT_API_KEY and ERPNEXT_API_SECRET must be filled in first." };
  await reconcileOpen({ createMissing });
  revalidatePath("/orders");
  return { ok: true, message: createMissing ? "Done. Missing suppliers and items were created, and the drafts were updated." : "ERPNext drafts updated. Check the status on each line." };
}

/** Manual fallback: re-sync every approved line into draft purchase orders. */
export async function sendToErp(name: string): Promise<R> { return run(name, false); }
/** Only called after the user has said yes to creating the listed suppliers and items. */
export async function createMissingInErp(name: string): Promise<R> { return run(name, true); }
