import { query } from "./db";
import { crossCheck, validateCsv, type CsvKind } from "./csv";
import { runAnalysis } from "./pipeline";
import { loadDataset, saveDataset } from "./store";
import type { DataSet } from "./seed-data";

export const KINDS: CsvKind[] = ["skus", "distributors", "calendar", "sales", "inventory"];
const KEY: Record<CsvKind, keyof DataSet> = { skus: "skus", distributors: "distributors", calendar: "calendar", sales: "sales", inventory: "inventory" };

export interface Report {
  ok: boolean;
  files: { kind: CsvKind; rows: number; errors: string[]; warnings: string[] }[];
  crossIssues: string[];
  fatal?: string;
  runId?: number;
}

/** Validates the files, and (when commit is true and everything is clean) saves them in one transaction and runs the analysis. */
export async function importTexts(texts: Partial<Record<CsvKind, string>>, source: "upload" | "api", commit: boolean): Promise<Report> {
  const provided = KINDS.filter((k) => typeof texts[k] === "string" && texts[k]!.trim() !== "");
  if (provided.length === 0) return { ok: false, files: [], crossIssues: [], fatal: "No files were provided." };
  const files: Report["files"] = [];
  const parsed: Partial<DataSet> = {};
  for (const k of provided) {
    const v = validateCsv(k, texts[k]!);
    files.push({ kind: k, rows: v.rowCount, errors: v.errors.slice(0, 20), warnings: v.warnings.slice(0, 20) });
    if (v.ok) (parsed as Record<string, unknown>)[KEY[k]] = v.rows;
  }
  if (files.some((f) => f.errors.length)) return { ok: false, files, crossIssues: [], fatal: "Some files have errors. Nothing was saved." };

  const existing = await loadDataset();
  const merged = { ...existing, ...parsed } as DataSet;
  if (parsed.sales) merged.sales = [...existing.sales.filter((s) => !parsed.sales!.some((n) => n.sku_id === s.sku_id && n.week === s.week)), ...parsed.sales];
  const crossIssues = crossCheck(merged).slice(0, 30);
  const report: Report = { ok: true, files, crossIssues };
  if (!commit) return report;

  try {
    await saveDataset(parsed);
    await query("INSERT INTO import_batches (source, counts, errors, warnings, status) VALUES ($1,$2,'[]',$3,'ok')",
      [source, JSON.stringify(Object.fromEntries(files.map((f) => [f.kind, f.rows]))), JSON.stringify(crossIssues)]);
    const { runId } = await runAnalysis(source === "api" ? "ingest" : "manual");
    return { ...report, runId };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    await query("INSERT INTO import_batches (source, counts, errors, status) VALUES ($1,'{}',$2,'failed')", [source, JSON.stringify([msg])]).catch(() => {});
    return { ok: false, files, crossIssues, fatal: `Saving failed, nothing was changed: ${msg}` };
  }
}
