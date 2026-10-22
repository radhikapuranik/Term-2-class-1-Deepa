export type Light = "good" | "warn" | "bad" | "unknown";

export interface WeekRate { week: string; overridden: number; decided: number }

/** Kill criterion: override rate above 40% for 4 weeks in a row. */
export function overrideLight(weeks: WeekRate[], limit = 0.4, minDecisions = 3): { light: Light; detail: string } {
  const recent = weeks.slice(-4);
  if (recent.length < 4 || recent.some((w) => w.decided < minDecisions)) {
    return { light: "unknown", detail: `Needs 4 weeks with at least ${minDecisions} decisions each. Weeks with enough decisions so far: ${weeks.filter((w) => w.decided >= minDecisions).length}.` };
  }
  const over = recent.filter((w) => w.overridden / w.decided > limit).length;
  const pct = (w: WeekRate) => Math.round((w.overridden / w.decided) * 100);
  const detail = `Last 4 weeks: ${recent.map((w) => `${pct(w)}%`).join(", ")}.`;
  return { light: over === 4 ? "bad" : over >= 1 ? "warn" : "good", detail };
}

/** Kill criterion: the SAP export cannot be made reliable by about day 30. */
export function exportLight(batches: { status: string }[], dataAgeDays: number | null): { light: Light; detail: string } {
  if (batches.length === 0) return { light: "unknown", detail: "No uploaded or pushed files yet (the demo data was loaded from the seed files)." };
  const ok = batches.filter((b) => b.status === "ok").length;
  const share = ok / batches.length;
  const age = dataAgeDays == null ? "unknown" : `${dataAgeDays} days`;
  const light: Light = share >= 0.9 && (dataAgeDays ?? 99) <= 5 ? "good" : share >= 0.6 && (dataAgeDays ?? 99) <= 10 ? "warn" : "bad";
  return { light, detail: `${ok} of ${batches.length} recent files were accepted. Newest stock figure is ${age} old.` };
}

export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
