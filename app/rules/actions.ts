"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { runEngine } from "@/lib/rules/engine";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/rules/types";
import { loadDataset, loadSettings } from "@/lib/store";

const num = (min: number, max: number) => z.coerce.number().min(min).max(max);
const Schema = z.object({
  stockoutWeeksNormal: num(0.5, 52), overstockWeeksNormal: num(1, 104),
  stockoutWeeksPerishable: num(0.5, 52), overstockWeeksPerishable: num(1, 104),
  highDemandRatio: num(1, 3), highDemandMultiplier: num(1, 5), festivalUpliftPct: num(0, 200),
  baselineWindow: z.enum(["trailing12", "prior12"]), borderlinePct: num(0, 50), swingPct: num(5, 200), minHistoryWeeks: num(4, 52),
}).refine((v) => v.stockoutWeeksNormal < v.overstockWeeksNormal && v.stockoutWeeksPerishable < v.overstockWeeksPerishable,
  { message: "Each minimum must be lower than its maximum." });

export interface RulesState {
  error?: string; saved?: boolean;
  preview?: { sku_id: string; name: string; before: string; after: string }[];
}

function parse(form: FormData): { s: Settings } | { error: string } {
  const p = Schema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message.includes("minimum") ? p.error.issues[0].message : `Check the values: ${p.error.issues[0].path.join(".")} is not valid.` };
  const { borderlinePct, swingPct, ...rest } = p.data;
  return { s: { ...DEFAULT_SETTINGS, ...rest, borderlineMargin: borderlinePct / 100, swingPct: swingPct / 100 } };
}

const describe = (r: { headline: string; status: string }) => r.headline + (r.status === "exception" ? " (exception)" : "");

export async function rulesAction(_: RulesState | undefined, form: FormData): Promise<RulesState> {
  const intent = String(form.get("intent"));
  const parsed = parse(form);
  if ("error" in parsed) return { error: parsed.error };
  const [ds, current] = await Promise.all([loadDataset(), loadSettings()]);
  if (intent === "preview") {
    const a = runEngine({ ...ds, settings: current }), b = runEngine({ ...ds, settings: parsed.s });
    const preview = b.results.flatMap((r, i) => {
      const before = describe(a.results[i]), after = describe(r);
      return before === after ? [] : [{ sku_id: r.sku_id, name: r.sku_name.replace("Freshroots ", ""), before, after }];
    });
    return { preview };
  }
  const who = await requireUser().catch(() => null);
  if (!who) return { error: "Sign in with the passcode to change rules." };
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < 3) return { error: "Please give a short reason for the change." };
  let changed = 0;
  for (const [k, v] of Object.entries(parsed.s) as [keyof Settings, unknown][]) {
    if (JSON.stringify(current[k]) === JSON.stringify(v)) continue;
    changed++;
    await query("INSERT INTO settings_history (key, old_value, new_value, reason, changed_by) VALUES ($1,$2,$3,$4,$5)",
      [k, JSON.stringify(current[k]), JSON.stringify(v), reason, who]);
    await query("INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()", [k, JSON.stringify(v)]);
  }
  revalidatePath("/rules");
  return changed ? { saved: true } : { error: "Nothing changed." };
}
