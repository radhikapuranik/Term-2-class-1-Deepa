import { describe, expect, it } from "vitest";
import { runEngine, lookupFestival } from "@/lib/rules/engine";
import { DEFAULT_SETTINGS, type EngineInput, type SkuRow } from "@/lib/rules/types";
import { loadSeedFiles } from "@/lib/seed-data";
import { addWeeks, weekRange, weekToMonday, isoDate } from "@/lib/weeks";
import { validateCsv } from "@/lib/csv";

const seed = loadSeedFiles();
const input = (over: Partial<EngineInput> = {}): EngineInput => ({ ...seed, settings: DEFAULT_SETTINGS, ...over });
const byId = (out: ReturnType<typeof runEngine>, id: string) => out.results.find((r) => r.sku_id === id)!;

// id, avg12, avg4, cover, status, qty, coverAfter
const GOLDEN: [string, number, number, number, string, number | null, number][] = [
  ["SKU001", 214.9, 261.0, 3.35, "stockout", 750, 6.14],
  ["SKU002", 83.8, 83.8, 11.46, "ok", null, 11.46],
  ["SKU003", 150.5, 150.8, 4.36, "stockout", 300, 5.95],
  ["SKU004", 79.8, 81.0, 1.8, "stockout", 150, 3.31],
  ["SKU005", 59.5, 58.2, 8.07, "ok", null, 8.07],
  ["SKU006", 39.6, 40.2, 22.23, "overstock", 0, 22.23],
  ["SKU007", 121.5, 133.5, 4.08, "overstock", 0, 4.08],
  ["SKU008", 108.8, 103.0, 6.99, "ok", null, 6.99],
  ["SKU009", 34.1, 34.8, 9.39, "ok", null, 9.39],
  ["SKU010", 24.4, 24.8, 8.52, "ok", null, 8.52],
  ["SKU011", 204.3, 209.2, 1.8, "stockout", 500, 3.76],
  ["SKU012", 56.8, 60.0, 6.77, "ok", null, 6.77],
  ["SKU013", 45.4, 44.8, 3.17, "stockout", 120, 5.28],
  ["SKU014", 72.4, 77.5, 6.85, "ok", null, 6.85],
  ["SKU015", 29.8, 28.8, 9.65, "ok", null, 9.65],
];

describe("golden table (October, uplift ON)", () => {
  const out = runEngine(input());
  it("uplift is on for October", () => {
    expect(out.upliftApplied).toBe(true);
    expect(out.asOf).toBe("2026-10-19");
  });
  it.each(GOLDEN)("%s", (id, avg12, avg4, cover, status, qty, after) => {
    const r = byId(out, id);
    expect(Math.abs(r.avg12! - avg12)).toBeLessThanOrEqual(0.06);
    expect(Math.abs(r.avg4! - avg4)).toBeLessThanOrEqual(0.06);
    expect(r.cover!).toBeCloseTo(cover, 2);
    expect(r.status).toBe(status);
    expect(r.qty).toBe(qty);
    expect(r.coverAfter!).toBeCloseTo(after, 2);
  });
  it("totals", () => {
    expect(out.results.filter((r) => r.status === "stockout").map((r) => r.sku_id))
      .toEqual(["SKU001", "SKU003", "SKU004", "SKU011", "SKU013"]);
    expect(out.results.filter((r) => r.highDemand).map((r) => r.sku_id)).toEqual(["SKU001"]);
    expect(out.summary.overstock).toBe(2);
    expect(out.summary.ok).toBe(8);
  });
  it("SKU001 is urgent and 1.5x wins", () => {
    const r = byId(out, "SKU001");
    expect(r.urgent).toBe(true);
    expect(r.qty).toBe(1.5 * 500);
  });
  it("still-below-minimum is flagged for SKU003 and SKU013 with advisory top-up, not applied", () => {
    for (const id of ["SKU003", "SKU013"]) {
      const r = byId(out, id);
      expect(r.stillBelowMin).toBe(true);
      expect(r.advisoryTopUp).toBeGreaterThan(0);
      expect(r.exceptions.some((e) => e.code === "still_below_min")).toBe(true);
    }
    expect(byId(out, "SKU001").stillBelowMin).toBe(false);
  });
  it("perishable SKUs use 3 to 4 weeks", () => {
    const r = byId(out, "SKU007");
    expect([r.minWeeks, r.maxWeeks]).toEqual([3, 4]);
    expect(r.borderline.length).toBeGreaterThan(0);
  });
});

describe("festival uplift is applied before cover checks", () => {
  const off = runEngine(input({ upliftOverride: false }));
  it("SKU002 flips to overstock", () => {
    expect(byId(off, "SKU002").cover!).toBeCloseTo(14.33, 2);
    expect(byId(off, "SKU002").status).toBe("overstock");
  });
  it.each([["SKU003", 5.45], ["SKU004", 2.25], ["SKU007", 5.1], ["SKU013", 3.96]])("%s cover %f", (id, c) => {
    expect(byId(off, id).cover!).toBeCloseTo(c, 2);
  });
  it("SKU007 is no longer overstock when uplift is off", () => {
    expect(byId(off, "SKU007").status).toBe("overstock"); // 5.10 > max 4 still overstock
    expect(byId(off, "SKU007").cover!).toBeGreaterThan(byId(runEngine(input()), "SKU007").cover!);
  });
  it("non-festival calendar month gives no uplift", () => {
    const inv = seed.inventory.map((i) => ({ ...i, as_of_date: "2026-09-21" }));
    const o = runEngine(input({ inventory: inv }));
    expect(o.upliftApplied).toBe(false);
  });
  it("missing calendar month: no uplift and a warning", () => {
    const o = runEngine(input({ calendar: [] }));
    expect(o.upliftApplied).toBe(false);
    expect(o.warnings.join(" ")).toMatch(/missing from the calendar/);
  });
});

describe("window and settings", () => {
  it("prior12 baseline uses the 12 weeks before the last 4", () => {
    const o = runEngine(input({ settings: { ...DEFAULT_SETTINGS, baselineWindow: "prior12" } }));
    expect(byId(o, "SKU001").avg12!).toBeCloseTo(192.25, 2); // W27-W38 mean
  });
  it("lookupFestival", () => {
    expect(lookupFestival("2026-03-05", seed.calendar)).toBe(true);
    expect(lookupFestival("2026-04-05", seed.calendar)).toBe(false);
    expect(lookupFestival("2030-01-01", seed.calendar)).toBeNull();
  });
});

const sku = (over: Partial<SkuRow> = {}): SkuRow => ({
  sku_id: "X1", sku_name: "Test", category: "Snack", perishability: "Low",
  standard_reorder_qty: 100, unit_of_measure: "Units", distributor_id: "DIST001", ...over,
});
const flat = (id: string, units: number, n = 16, last = "2026-W42") =>
  weekRange(last, n).map((week) => ({ sku_id: id, week, units_sold: units }));
const inv = (id: string, units: number, asOf = "2026-10-19") => [{ sku_id: id, location: "L", units_on_hand: units, as_of_date: asOf }];
const mini = (over: Partial<EngineInput>) =>
  runEngine({ skus: [sku()], sales: flat("X1", 100), inventory: inv("X1", 1000), calendar: [], settings: DEFAULT_SETTINGS, ...over });

describe("edge cases", () => {
  it("fewer than 12 weeks: not enough history, no recommendation", () => {
    const r = mini({ sales: flat("X1", 100, 8) }).results[0];
    expect(r.status).toBe("exception");
    expect(r.qty).toBeNull();
    expect(r.exceptions[0].code).toBe("new_sku");
  });
  it("zero demand does not divide by zero", () => {
    const r = mini({ sales: flat("X1", 0) }).results[0];
    expect(r.cover).toBeNull();
    expect(r.exceptions[0].code).toBe("zero_demand");
  });
  it("missing inventory and missing sales", () => {
    expect(mini({ inventory: [] }).results[0].exceptions[0].code).toBe("missing_inventory");
    expect(mini({ sales: [] }).results[0].exceptions[0].code).toBe("missing_sales");
  });
  it("negative numbers are rejected as exceptions", () => {
    expect(mini({ inventory: inv("X1", -5) }).results[0].exceptions[0].code).toBe("negative_data");
  });
  it("a gap inside the window is an exception", () => {
    const sales = flat("X1", 100).filter((r) => r.week !== "2026-W35");
    expect(mini({ sales }).results[0].exceptions.some((e) => e.code === "data_gap")).toBe(true);
  });
  it("duplicates: last row wins, with warning", () => {
    const sales = [...flat("X1", 100), { sku_id: "X1", week: "2026-W42", units_sold: 100 }];
    expect(mini({ sales }).warnings.join(" ")).toMatch(/duplicate/);
  });
  it("stale inventory warns", () => {
    const o = mini({ inventory: inv("X1", 1000, "2026-09-01") });
    expect(o.warnings.join(" ")).toMatch(/older than the latest sales week/);
    expect(o.results[0].exceptions.some((e) => e.code === "stale_data")).toBe(true);
  });
  it("unknown distributor", () => {
    const r = mini({ distributors: [] }).results[0];
    expect(r.exceptions.some((e) => e.code === "unknown_distributor")).toBe(true);
  });
  it("high demand + overstock = conflicting signals, no quantity", () => {
    const sales = weekRange("2026-W42", 16).map((week, i) => ({ sku_id: "X1", week, units_sold: i >= 12 ? 200 : 100 }));
    const r = mini({ sales, inventory: inv("X1", 5000) }).results[0];
    expect(r.highDemand).toBe(true);
    expect(r.action).toBe("review");
    expect(r.qty).toBeNull();
    expect(r.exceptions.some((e) => e.code === "conflicting_signals")).toBe(true);
  });
  it("perishable + high demand raises an exception", () => {
    const sales = weekRange("2026-W42", 16).map((week, i) => ({ sku_id: "X1", week, units_sold: i >= 12 ? 200 : 100 }));
    const r = mini({ skus: [sku({ perishability: "High" })], sales, inventory: inv("X1", 400) }).results[0];
    expect(r.exceptions.some((e) => e.code === "perishable_high_demand")).toBe(true);
  });
  it("latest-week swing over 40% is flagged", () => {
    const sales = flat("X1", 100).map((r) => (r.week === "2026-W42" ? { ...r, units_sold: 180 } : r));
    expect(mini({ sales, inventory: inv("X1", 1000) }).results[0].exceptions.some((e) => e.code === "latest_week_swing")).toBe(true);
  });
  it("borderline is within the margin of a threshold", () => {
    // demand 100, cover 6.3 -> within 10% of 6
    const r = mini({ inventory: inv("X1", 630) }).results[0];
    expect(r.borderline.length).toBe(1);
    expect(mini({ inventory: inv("X1", 800) }).results[0].borderline.length).toBe(0);
  });
});

describe("weeks and csv", () => {
  it("ISO week maths", () => {
    expect(isoDate(weekToMonday("2026-W42")!)).toBe("2026-10-12");
    expect(addWeeks("2026-W01", -1)).toBe("2025-W52");
    expect(weekToMonday("2025-W53")).toBeNull();
  });
  it("CSV validator rejects bad weeks and missing columns", () => {
    expect(validateCsv("sales", "SKU_ID,Week,Units_Sold\nA,2026-W99,3").ok).toBe(false);
    expect(validateCsv("sales", "SKU_ID,Units_Sold\nA,3").errors[0]).toMatch(/Missing column/);
    expect(validateCsv("sales", "SKU_ID,Week,Units_Sold\nA,2026-W10,-3").ok).toBe(false);
    expect(validateCsv("sales", "SKU_ID,Week,Units_Sold\nA,2026-W10,3").ok).toBe(true);
  });
});
