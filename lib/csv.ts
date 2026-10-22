import { parse } from "csv-parse/sync";
import { z } from "zod";
import { weekToMonday } from "./weeks";
import type { CalendarRow, DistributorRow, InventoryRow, SalesRow, SkuRow } from "./rules/types";

export type CsvKind = "sales" | "inventory" | "skus" | "distributors" | "calendar";

export interface Validation<T> {
  kind: CsvKind;
  rows: T[];
  rowCount: number;
  errors: string[];
  warnings: string[];
  ok: boolean;
}

const HEADERS: Record<CsvKind, string[]> = {
  sales: ["SKU_ID", "Week", "Units_Sold"],
  inventory: ["SKU_ID", "Location", "Units_On_Hand", "As_Of_Date"],
  skus: ["SKU_ID", "SKU_Name", "Category", "Perishability", "Standard_Reorder_Qty", "Unit_of_Measure", "Distributor_ID"],
  distributors: ["Distributor_ID", "Distributor_Name", "Region", "Status"],
  calendar: ["Year", "Month", "Year_Month", "Is_Festival_Month"],
};

const int = z.coerce.number().int();
const SCHEMAS = {
  sales: z.object({ SKU_ID: z.string().min(1), Week: z.string(), Units_Sold: int }),
  inventory: z.object({
    SKU_ID: z.string().min(1), Location: z.string().min(1), Units_On_Hand: int,
    As_Of_Date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must look like 2026-10-19"),
  }),
  skus: z.object({
    SKU_ID: z.string().min(1), SKU_Name: z.string().min(1), Category: z.string(),
    Perishability: z.enum(["Low", "High"]), Standard_Reorder_Qty: int.positive(),
    Unit_of_Measure: z.string(), Distributor_ID: z.string().min(1),
  }),
  distributors: z.object({ Distributor_ID: z.string().min(1), Distributor_Name: z.string(), Region: z.string(), Status: z.string() }),
  calendar: z.object({
    Year: int, Month: int.min(1).max(12), Year_Month: z.string().regex(/^\d{4}-\d{2}$/),
    Is_Festival_Month: z.string().transform((v) => v.trim().toUpperCase()).pipe(z.enum(["TRUE", "FALSE"])),
  }),
} as const;

export function validateCsv(kind: CsvKind, text: string): Validation<unknown> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let records: Record<string, string>[] = [];
  try {
    records = parse(text, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  } catch (e) {
    errors.push(`Could not read the file as CSV: ${(e as Error).message}`);
    return { kind, rows: [], rowCount: 0, errors, warnings, ok: false };
  }
  const have = records.length ? Object.keys(records[0]) : [];
  const missing = HEADERS[kind].filter((h) => !have.includes(h));
  if (records.length === 0) errors.push("The file has no data rows.");
  else if (missing.length) errors.push(`Missing column(s): ${missing.join(", ")}. Expected: ${HEADERS[kind].join(", ")}.`);
  if (errors.length) return { kind, rows: [], rowCount: records.length, errors, warnings, ok: false };

  const rows: unknown[] = [];
  const seen = new Set<string>();
  records.forEach((rec, i) => {
    const line = i + 2;
    const parsed = SCHEMAS[kind].safeParse(rec);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      errors.push(`Row ${line}: ${issue.path.join(".")} ${issue.message}`);
      return;
    }
    const v = parsed.data as Record<string, unknown>;
    if (kind === "sales") {
      if (!weekToMonday(String(v.Week))) { errors.push(`Row ${line}: "${v.Week}" is not a valid ISO week (like 2026-W42).`); return; }
      if ((v.Units_Sold as number) < 0) { errors.push(`Row ${line}: negative units sold.`); return; }
    }
    if (kind === "inventory" && (v.Units_On_Hand as number) < 0) { errors.push(`Row ${line}: negative stock.`); return; }
    const key = kind === "sales" ? `${v.SKU_ID}|${v.Week}` : kind === "calendar" ? String(v.Year_Month)
      : kind === "inventory" ? `${v.SKU_ID}|${v.Location}` : String(v.SKU_ID ?? v.Distributor_ID);
    if (seen.has(key)) warnings.push(`Row ${line}: duplicate ${key}; the later row wins.`);
    seen.add(key);
    rows.push(map(kind, v));
  });
  return { kind, rows, rowCount: records.length, errors, warnings, ok: errors.length === 0 };
}

function map(kind: CsvKind, v: Record<string, unknown>): unknown {
  switch (kind) {
    case "sales": return { sku_id: v.SKU_ID, week: String(v.Week), units_sold: v.Units_Sold } as SalesRow;
    case "inventory": return { sku_id: v.SKU_ID, location: v.Location, units_on_hand: v.Units_On_Hand, as_of_date: v.As_Of_Date } as InventoryRow;
    case "skus": return {
      sku_id: v.SKU_ID, sku_name: v.SKU_Name, category: v.Category, perishability: v.Perishability,
      standard_reorder_qty: v.Standard_Reorder_Qty, unit_of_measure: v.Unit_of_Measure, distributor_id: v.Distributor_ID,
    } as SkuRow;
    case "distributors": return { distributor_id: v.Distributor_ID, distributor_name: v.Distributor_Name, region: v.Region, status: v.Status } as DistributorRow;
    case "calendar": return { year: v.Year, month: v.Month, year_month: v.Year_Month, is_festival_month: v.Is_Festival_Month === "TRUE" } as CalendarRow;
  }
}

/** Cross-file checks, shown before anything is saved. */
export function crossCheck(d: {
  skus: SkuRow[]; sales: SalesRow[]; inventory: InventoryRow[]; distributors: DistributorRow[];
}): string[] {
  const out: string[] = [];
  const skuIds = new Set(d.skus.map((s) => s.sku_id));
  const salesIds = new Set(d.sales.map((s) => s.sku_id));
  const invIds = new Set(d.inventory.map((s) => s.sku_id));
  const dist = new Set(d.distributors.map((x) => x.distributor_id));
  for (const id of skuIds) {
    if (!salesIds.has(id)) out.push(`${id} has no sales rows.`);
    if (!invIds.has(id)) out.push(`${id} has no inventory row.`);
  }
  for (const id of salesIds) if (!skuIds.has(id)) out.push(`Sales file mentions ${id}, which is not in the SKU list.`);
  for (const id of invIds) if (!skuIds.has(id)) out.push(`Inventory file mentions ${id}, which is not in the SKU list.`);
  for (const s of d.skus) if (!dist.has(s.distributor_id)) out.push(`${s.sku_id} uses unknown distributor ${s.distributor_id}.`);
  return out;
}
