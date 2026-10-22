import { query, transaction } from "./db";
import { DEFAULT_SETTINGS, type CalendarRow, type DistributorRow, type InventoryRow, type SalesRow, type Settings, type SkuRow } from "./rules/types";
import type { DataSet } from "./seed-data";

export async function loadSettings(): Promise<Settings> {
  const rows = await query<{ key: string; value: unknown }>("SELECT key, value FROM settings");
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) out[r.key] = r.value;
  return out as unknown as Settings;
}

export async function loadDataset(): Promise<DataSet> {
  const [skus, sales, inventory, distributors, calendar] = await Promise.all([
    query<SkuRow>("SELECT sku_id, sku_name, category, perishability, standard_reorder_qty, unit_of_measure, distributor_id, unit_cost::float8 AS unit_cost FROM skus ORDER BY sku_id"),
    query<SalesRow>("SELECT sku_id, week, units_sold FROM weekly_sales ORDER BY sku_id, week"),
    query<InventoryRow>(`SELECT DISTINCT ON (sku_id, location) sku_id, location, units_on_hand, to_char(as_of_date,'YYYY-MM-DD') AS as_of_date
                         FROM inventory_snapshots ORDER BY sku_id, location, as_of_date DESC`),
    query<DistributorRow>("SELECT * FROM distributors ORDER BY distributor_id"),
    query<CalendarRow>("SELECT year, month, year_month, is_festival_month FROM calendar ORDER BY year_month"),
  ]);
  return { skus, sales, inventory, distributors, calendar };
}

/** Saves a validated dataset in one transaction: either everything lands or nothing does. */
export async function saveDataset(d: Partial<DataSet>) {
  const st: { text: string; params?: unknown[] }[] = [];
  const bulk = (table: string, cols: string[], rows: Record<string, unknown>[], conflict: string, update: string[]) => {
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const params: unknown[] = [];
      const values = chunk.map((r) => `(${cols.map((c) => { params.push(r[c]); return `$${params.length}`; }).join(",")})`).join(",");
      const set = update.length ? `DO UPDATE SET ${update.map((c) => `${c}=EXCLUDED.${c}`).join(",")}` : "DO NOTHING";
      st.push({ text: `INSERT INTO ${table} (${cols.join(",")}) VALUES ${values} ON CONFLICT (${conflict}) ${set}`, params });
    }
  };
  const uniq = <T,>(rows: T[], key: (r: T) => string) => [...new Map(rows.map((r) => [key(r), r])).values()];
  if (d.distributors) bulk("distributors", ["distributor_id", "distributor_name", "region", "status"], d.distributors as never, "distributor_id", ["distributor_name", "region", "status"]);
  if (d.skus) bulk("skus", ["sku_id", "sku_name", "category", "perishability", "standard_reorder_qty", "unit_of_measure", "distributor_id"], d.skus as never, "sku_id", ["sku_name", "category", "perishability", "standard_reorder_qty", "unit_of_measure", "distributor_id"]);
  if (d.sales) bulk("weekly_sales", ["sku_id", "week", "units_sold"], uniq(d.sales, (r) => r.sku_id + r.week) as never, "sku_id,week", ["units_sold"]);
  if (d.inventory) bulk("inventory_snapshots", ["sku_id", "location", "units_on_hand", "as_of_date"], uniq(d.inventory, (r) => r.sku_id + r.location + r.as_of_date) as never, "sku_id,location,as_of_date", ["units_on_hand"]);
  if (d.calendar) bulk("calendar", ["year_month", "year", "month", "is_festival_month"], d.calendar as never, "year_month", ["year", "month", "is_festival_month"]);
  if (st.length) await transaction(st);
}
