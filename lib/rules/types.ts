export interface Settings {
  stockoutWeeksNormal: number;
  overstockWeeksNormal: number;
  stockoutWeeksPerishable: number;
  overstockWeeksPerishable: number;
  highDemandRatio: number;
  highDemandMultiplier: number;
  festivalUpliftPct: number;
  /** "trailing12": last 12 weeks incl. last 4. "prior12": the 12 weeks before the last 4. */
  baselineWindow: "trailing12" | "prior12";
  borderlineMargin: number;
  swingPct: number;
  minHistoryWeeks: number;
}

export const DEFAULT_SETTINGS: Settings = {
  stockoutWeeksNormal: 6,
  overstockWeeksNormal: 14,
  stockoutWeeksPerishable: 3,
  overstockWeeksPerishable: 4,
  highDemandRatio: 1.2,
  highDemandMultiplier: 1.5,
  festivalUpliftPct: 25,
  baselineWindow: "trailing12",
  borderlineMargin: 0.1,
  swingPct: 0.4,
  minHistoryWeeks: 12,
};

export interface SkuRow {
  sku_id: string;
  sku_name: string;
  category: string;
  perishability: "Low" | "High";
  standard_reorder_qty: number;
  unit_of_measure: string;
  distributor_id: string;
  unit_cost?: number | null;
}
export interface SalesRow { sku_id: string; week: string; units_sold: number }
export interface InventoryRow { sku_id: string; location: string; units_on_hand: number; as_of_date: string }
export interface CalendarRow { year: number; month: number; year_month: string; is_festival_month: boolean }
export interface DistributorRow { distributor_id: string; distributor_name: string; region: string; status: string }

export type Status = "stockout" | "overstock" | "ok" | "exception";
export type Action = "reorder" | "pause" | "none" | "review";

export type ExceptionCode =
  | "new_sku"
  | "data_gap"
  | "negative_data"
  | "missing_inventory"
  | "missing_sales"
  | "zero_demand"
  | "conflicting_signals"
  | "still_below_min"
  | "borderline"
  | "perishable_high_demand"
  | "latest_week_swing"
  | "stale_data"
  | "unknown_distributor";

export interface SkuException { code: ExceptionCode; message: string }
export interface TraceLine { label: string; value: string; note?: string }

export interface SkuResult {
  sku_id: string;
  sku_name: string;
  distributor_id: string;
  perishable: boolean;
  avg4: number | null;
  avg12: number | null;
  demand: number | null;
  onHand: number | null;
  cover: number | null;
  minWeeks: number;
  maxWeeks: number;
  status: Status;
  highDemand: boolean;
  urgent: boolean;
  action: Action;
  qty: number | null;
  coverAfter: number | null;
  advisoryTopUp: number | null;
  stillBelowMin: boolean;
  borderline: string[];
  exceptions: SkuException[];
  trace: TraceLine[];
  headline: string;
}

export interface EngineInput {
  skus: SkuRow[];
  sales: SalesRow[];
  inventory: InventoryRow[];
  calendar: CalendarRow[];
  distributors?: DistributorRow[];
  settings: Settings;
  /** true/false forces festival uplift on/off; undefined/null uses the calendar. */
  upliftOverride?: boolean | null;
}

export interface EngineOutput {
  asOf: string | null;
  asOfMonth: string | null;
  festival: boolean | null;
  upliftApplied: boolean;
  latestWeek: string | null;
  warnings: string[];
  results: SkuResult[];
  summary: { stockout: number; highDemand: number; overstock: number; ok: number; exceptions: number; needsDecision: number };
}
