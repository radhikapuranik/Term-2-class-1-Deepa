import { addWeeks, weekRange } from "./weeks";

export interface StaleBacktest {
  weeksTested: string[];
  skus: number;
  freshErrPct: number;
  staleErrPct: number;
  window: number;
}

/**
 * Simple back-test. For each of the last `tests` weeks and each SKU, forecast that week as the plain
 * average of the `window` weeks ending `age` weeks earlier, and compare with what actually sold.
 * Error is total absolute miss divided by total units sold (WAPE).
 */
export function staleBacktest(
  sales: { sku_id: string; week: string; units_sold: number }[],
  opts: { tests?: number; window?: number; freshAge?: number; staleAge?: number } = {},
): StaleBacktest | null {
  const { tests = 4, window = 4, freshAge = 1, staleAge = 4 } = opts;
  const last = sales.reduce((m, s) => (s.week > m ? s.week : m), "");
  if (!last) return null;
  const bySku = new Map<string, Map<string, number>>();
  for (const s of sales) bySku.set(s.sku_id, (bySku.get(s.sku_id) ?? new Map()).set(s.week, s.units_sold));
  const weeks = weekRange(last, tests);
  const run = (age: number) => {
    let miss = 0, total = 0, used = 0;
    for (const [, m] of bySku) {
      for (const w of weeks) {
        const actual = m.get(w);
        const hist = weekRange(addWeeks(w, -age), window).map((x) => m.get(x));
        if (actual == null || hist.some((h) => h == null)) continue;
        const f = (hist as number[]).reduce((a, b) => a + b, 0) / window;
        miss += Math.abs(f - actual); total += actual; used++;
      }
    }
    return { pct: total ? (miss / total) * 100 : NaN, used };
  };
  const fresh = run(freshAge), stale = run(staleAge);
  if (!fresh.used || !stale.used) return null;
  return { weeksTested: weeks, skus: bySku.size, freshErrPct: fresh.pct, staleErrPct: stale.pct, window };
}
