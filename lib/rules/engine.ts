import { weekRange, weekToMonday, isoDate } from "../weeks";
import type {
  EngineInput, EngineOutput, SkuException, SkuResult, SkuRow, TraceLine, Settings, ExceptionCode,
} from "./types";

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const near = (value: number, threshold: number, margin: number) =>
  Math.abs(value - threshold) <= threshold * margin + 1e-9;

export function thresholdsFor(sku: Pick<SkuRow, "perishability">, s: Settings) {
  return sku.perishability === "High"
    ? { min: s.stockoutWeeksPerishable, max: s.overstockWeeksPerishable }
    : { min: s.stockoutWeeksNormal, max: s.overstockWeeksNormal };
}

export function lookupFestival(asOf: string | null, calendar: EngineInput["calendar"]): boolean | null {
  if (!asOf) return null;
  const row = calendar.find((c) => c.year_month === asOf.slice(0, 7));
  return row ? row.is_festival_month : null;
}

export function runEngine(input: EngineInput): EngineOutput {
  const { settings: s } = input;
  const warnings: string[] = [];

  const invBySku = new Map<string, { units: number; asOf: string }>();
  let asOf: string | null = null;
  for (const row of input.inventory) {
    invBySku.set(row.sku_id, { units: row.units_on_hand, asOf: row.as_of_date });
    if (!asOf || row.as_of_date > asOf) asOf = row.as_of_date;
  }

  const salesBySku = new Map<string, Map<string, number>>();
  let dupes = 0;
  let latestWeek: string | null = null;
  for (const row of input.sales) {
    const m = salesBySku.get(row.sku_id) ?? new Map<string, number>();
    if (m.has(row.week)) dupes++;
    m.set(row.week, row.units_sold);
    salesBySku.set(row.sku_id, m);
    if (!latestWeek || row.week > latestWeek) latestWeek = row.week;
  }
  if (dupes) warnings.push(`${dupes} duplicate sales rows found; the last row for each SKU and week was used.`);

  const festivalCal = lookupFestival(asOf, input.calendar);
  const festival = input.upliftOverride ?? festivalCal;
  if (asOf && festivalCal === null) {
    warnings.push(`Month ${asOf.slice(0, 7)} is missing from the calendar, so no festival uplift was applied.`);
  }
  const upliftApplied = festival === true;
  const uplift = upliftApplied ? 1 + s.festivalUpliftPct / 100 : 1;

  let inventoryStale = false;
  if (asOf && latestWeek) {
    const monday = weekToMonday(latestWeek);
    if (monday && asOf < isoDate(new Date(monday.getTime() + 6 * 86_400_000))) {
      inventoryStale = true;
      warnings.push(`Inventory (${asOf}) is older than the latest sales week (${latestWeek}).`);
    }
  }
  if (!asOf) warnings.push("No inventory data loaded.");

  const distIds = input.distributors ? new Set(input.distributors.map((d) => d.distributor_id)) : null;
  const need = Math.max(s.minHistoryWeeks, 4);
  const results = input.skus.map((sku) =>
    evaluate(sku, {
      s, uplift, upliftApplied, latestWeek, inv: invBySku.get(sku.sku_id),
      sales: salesBySku.get(sku.sku_id), inventoryStale, distIds, need,
    }),
  );

  const summary = {
    stockout: results.filter((r) => r.status === "stockout").length,
    highDemand: results.filter((r) => r.highDemand).length,
    overstock: results.filter((r) => r.status === "overstock").length,
    ok: results.filter((r) => r.status === "ok").length,
    exceptions: results.filter((r) => r.exceptions.length > 0).length,
    needsDecision: results.filter((r) => r.action === "reorder" || r.action === "pause" || r.action === "review" || r.status === "exception").length,
  };

  return {
    asOf, asOfMonth: asOf ? asOf.slice(0, 7) : null, festival: festival ?? null,
    upliftApplied, latestWeek, warnings, results, summary,
  };
}

interface Ctx {
  s: Settings; uplift: number; upliftApplied: boolean; latestWeek: string | null;
  inv?: { units: number; asOf: string }; sales?: Map<string, number>;
  inventoryStale: boolean; distIds: Set<string> | null; need: number;
}

function evaluate(sku: SkuRow, c: Ctx): SkuResult {
  const { s } = c;
  const { min, max } = thresholdsFor(sku, s);
  const perishable = sku.perishability === "High";
  const exceptions: SkuException[] = [];
  const ex = (code: ExceptionCode, message: string) => exceptions.push({ code, message });
  const trace: TraceLine[] = [];

  const blank = (status: "exception", headline: string): SkuResult => ({
    sku_id: sku.sku_id, sku_name: sku.sku_name, distributor_id: sku.distributor_id, perishable,
    avg4: null, avg12: null, demand: null, onHand: c.inv?.units ?? null, cover: null,
    minWeeks: min, maxWeeks: max, status, highDemand: false, urgent: false, action: "none",
    qty: null, coverAfter: null, advisoryTopUp: null, stillBelowMin: false, borderline: [],
    exceptions, trace, headline,
  });

  if (c.distIds && !c.distIds.has(sku.distributor_id)) {
    ex("unknown_distributor", `Distributor ${sku.distributor_id} is not in the distributor list.`);
  }
  if (!c.sales || c.sales.size === 0 || !c.latestWeek) {
    ex("missing_sales", "No sales history for this SKU.");
    trace.push({ label: "Result", value: "No sales data", note: "needs planner judgment" });
    return blank("exception", "No sales data");
  }
  if (!c.inv) {
    ex("missing_inventory", "No inventory row for this SKU.");
    trace.push({ label: "Result", value: "No inventory data", note: "needs planner judgment" });
    return blank("exception", "No stock figure");
  }
  const onHand = c.inv.units;
  if (onHand < 0 || [...c.sales.values()].some((v) => v < 0)) {
    ex("negative_data", "Negative stock or sales figure found; the file needs fixing.");
    trace.push({ label: "Result", value: "Negative numbers in data" });
    return blank("exception", "Bad data (negative number)");
  }
  if (c.inventoryStale) ex("stale_data", "Stock figure is older than the latest sales week.");

  if (c.sales.size < c.need) {
    ex("new_sku", `Only ${c.sales.size} weeks of history; ${c.need} needed.`);
    trace.push({ label: "History", value: `${c.sales.size} weeks`, note: `needs ${c.need}` });
    trace.push({ label: "Result", value: "Not enough history", note: "no automatic recommendation" });
    return blank("exception", "Not enough history");
  }

  const span = s.baselineWindow === "prior12" ? 16 : 12;
  const weeks = weekRange(c.latestWeek, span);
  const missing = weeks.filter((w) => !c.sales!.has(w));
  if (missing.length) {
    ex("data_gap", `Missing sales for ${missing.join(", ")}.`);
    trace.push({ label: "Result", value: "Gaps in sales weeks", note: missing.join(", ") });
    return blank("exception", "Gaps in sales data");
  }
  const series = weeks.map((w) => c.sales!.get(w)!);
  const last4 = series.slice(-4);
  const avg4Raw = mean(last4);
  const base = s.baselineWindow === "prior12" ? series.slice(0, 12) : series.slice(-12);
  const avg12Raw = mean(base);
  const demandRaw = avg12Raw * c.uplift;
  const avg4 = r2(avg4Raw);
  const avg12 = r2(avg12Raw);
  const demand = r2(demandRaw);
  const lastWeekUnits = series[series.length - 1];

  trace.push({ label: "Last 4 wks avg (avg4)", value: avg4.toFixed(1), note: `${last4.join(" ")}` });
  trace.push({
    label: "12-wk baseline (avg12)", value: avg12.toFixed(1),
    note: s.baselineWindow === "prior12" ? "12 weeks before last 4" : "last 12 weeks incl. last 4",
  });
  trace.push({
    label: "Festival uplift", value: c.upliftApplied ? `x${c.uplift.toFixed(2)}` : "none",
    note: c.upliftApplied ? "festival month" : "not a festival month / switched off",
  });
  trace.push({ label: "Weekly demand (d)", value: demand.toFixed(1), note: `avg12 x ${c.uplift.toFixed(2)}` });
  trace.push({ label: "Stock on hand", value: String(onHand), note: `as of ${c.inv.asOf}` });

  if (demandRaw <= 0) {
    ex("zero_demand", "No sales in the baseline window, so weeks of cover cannot be worked out.");
    trace.push({ label: "Result", value: "Zero demand", note: "cover undefined" });
    const r = blank("exception", "Zero demand");
    return { ...r, avg4, avg12, demand };
  }

  const cover = r2(onHand / demandRaw);
  const highDemand = avg4Raw > s.highDemandRatio * avg12Raw;
  const stockout = cover < min;
  const overstock = cover > max;
  trace.push({ label: "Weeks of cover", value: cover.toFixed(2), note: `${onHand} / ${demand.toFixed(1)}` });
  trace.push({ label: "Safe range", value: `${min} to ${max} wks`, note: perishable ? "perishable" : "normal" });
  trace.push({
    label: "High demand test", value: highDemand ? "YES" : "no",
    note: `avg4 ${avg4.toFixed(1)} vs ${s.highDemandRatio} x avg12 = ${(s.highDemandRatio * avg12).toFixed(1)}`,
  });

  let action: SkuResult["action"] = "none";
  let qty: number | null = null;
  let urgent = false;
  const std = sku.standard_reorder_qty;
  const bumped = Math.round(std * s.highDemandMultiplier);

  if (highDemand && overstock) {
    action = "review";
    ex("conflicting_signals", "Demand is rising but stock already looks high. No automatic quantity.");
    trace.push({ label: "Result", value: "CONFLICTING SIGNALS", note: "planner to decide" });
  } else if (highDemand) {
    action = "reorder"; qty = bumped; urgent = stockout;
    trace.push({
      label: "Result", value: stockout ? "STOCKOUT + HIGH DEMAND" : "HIGH DEMAND",
      note: `reorder ${s.highDemandMultiplier} x ${std}`,
    });
  } else if (stockout) {
    action = "reorder"; qty = std;
    trace.push({ label: "Result", value: "STOCKOUT RISK", note: `reorder ${std}` });
  } else if (overstock) {
    action = "pause"; qty = 0;
    trace.push({ label: "Result", value: "OVERSTOCK", note: "pause next order" });
  } else {
    trace.push({ label: "Result", value: "OK", note: "no action" });
  }
  if (highDemand && stockout) trace.push({ label: "Precedence", value: "1.5x quantity wins", note: "marked urgent" });

  const coverAfter = action === "review" ? null : r2((onHand + (qty ?? 0)) / demandRaw);
  let stillBelowMin = false;
  let advisoryTopUp: number | null = null;
  if (coverAfter !== null) {
    trace.push({ label: "Cover after order", value: coverAfter.toFixed(2), note: `(${onHand} + ${qty ?? 0}) / ${demand.toFixed(1)}` });
    if (qty !== null && qty > 0 && coverAfter < min) {
      stillBelowMin = true;
      advisoryTopUp = Math.max(1, Math.ceil(min * demandRaw - onHand - qty));
      ex("still_below_min", `Still below ${min} weeks after the order (${coverAfter.toFixed(1)}). Advisory extra: ${advisoryTopUp} units.`);
      trace.push({ label: "Warning", value: "Still below minimum", note: `advisory top-up ${advisoryTopUp} (not applied)` });
    }
  }

  const borderline: string[] = [];
  if (near(cover, min, s.borderlineMargin)) borderline.push(`cover close to minimum (${min})`);
  if (near(cover, max, s.borderlineMargin)) borderline.push(`cover close to maximum (${max})`);
  if (near(avg4Raw / avg12Raw, s.highDemandRatio, s.borderlineMargin)) borderline.push(`demand trend close to the ${s.highDemandRatio}x line`);
  if (borderline.length) {
    ex("borderline", `Borderline: ${borderline.join("; ")}.`);
    trace.push({ label: "Borderline", value: "YES", note: borderline.join("; ") });
  }

  if (perishable && highDemand) ex("perishable_high_demand", "Perishable item with rising demand: check shelf life before ordering more.");
  if (avg4Raw > 0 && Math.abs(lastWeekUnits - avg4Raw) / avg4Raw > s.swingPct) {
    ex("latest_week_swing", `Latest week (${lastWeekUnits}) is more than ${Math.round(s.swingPct * 100)}% away from the 4-week average.`);
  }

  const status: SkuResult["status"] = stockout ? "stockout" : overstock ? "overstock" : "ok";
  const headline =
    action === "review" ? "Conflicting signals" :
    urgent ? `Urgent: reorder ${qty}` :
    action === "reorder" ? `Reorder ${qty}` :
    action === "pause" ? "Pause next order" : "No action";

  return {
    sku_id: sku.sku_id, sku_name: sku.sku_name, distributor_id: sku.distributor_id, perishable,
    avg4, avg12, demand, onHand, cover, minWeeks: min, maxWeeks: max, status, highDemand, urgent,
    action, qty, coverAfter, advisoryTopUp, stillBelowMin, borderline, exceptions, trace, headline,
  };
}
