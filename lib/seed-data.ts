import { readFileSync } from "node:fs";
import path from "node:path";
import { crossCheck, validateCsv, type CsvKind } from "./csv";
import type { CalendarRow, DistributorRow, InventoryRow, SalesRow, SkuRow } from "./rules/types";

const FILES: Record<CsvKind, string> = {
  sales: "weekly_sales.csv", inventory: "current_inventory.csv", skus: "sku_master.csv",
  distributors: "distributor_master.csv", calendar: "calendar.csv",
};

export interface DataSet {
  skus: SkuRow[]; sales: SalesRow[]; inventory: InventoryRow[];
  distributors: DistributorRow[]; calendar: CalendarRow[];
}

export function loadSeedFiles(dir = path.join(process.cwd(), "data", "seed")): DataSet {
  const get = <T,>(kind: CsvKind) => {
    const v = validateCsv(kind, readFileSync(path.join(dir, FILES[kind]), "utf8"));
    if (!v.ok) throw new Error(`${FILES[kind]}: ${v.errors.slice(0, 3).join(" | ")}`);
    return v.rows as T[];
  };
  const ds: DataSet = {
    sales: get("sales"), inventory: get("inventory"), skus: get("skus"),
    distributors: get("distributors"), calendar: get("calendar"),
  };
  const problems = crossCheck(ds);
  if (problems.length) throw new Error(problems.join(" | "));
  return ds;
}
