"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { runAnalysis } from "@/lib/pipeline";

const COOLDOWN_S = 300;

export async function runNow(): Promise<{ ok: boolean; message: string }> {
  const who = await requireUser().catch(() => null);
  if (!who) return { ok: false, message: "Sign in with the passcode to run the analysis." };
  const last = await query<{ wait: number }>(
    "SELECT ceil($1 - extract(epoch FROM (now() - started_at)))::int AS wait FROM runs WHERE trigger_type='manual' ORDER BY id DESC LIMIT 1", [COOLDOWN_S]);
  if (last[0] && last[0].wait > 0) return { ok: false, message: `Please wait ${last[0].wait} seconds before running again.` };
  try {
    const { runId, out } = await runAnalysis("manual");
    revalidatePath("/", "layout");
    return { ok: true, message: `Run #${runId} finished: ${out.summary.needsDecision} of ${out.results.length} SKUs need a decision.` };
  } catch (e) {
    return { ok: false, message: `The run failed: ${(e as Error).message.slice(0, 160)}` };
  }
}
