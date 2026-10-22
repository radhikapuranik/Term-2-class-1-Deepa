"use server";
import { revalidatePath } from "next/cache";
import { blocked } from "@/lib/kill";
import { guard } from "@/lib/security";
import type { CsvKind } from "@/lib/csv";
import { importTexts, type Report } from "@/lib/importer";

export async function checkFiles(texts: Partial<Record<CsvKind, string>>): Promise<Report> {
  return importTexts(texts, "upload", false);
}

export async function saveFiles(texts: Partial<Record<CsvKind, string>>, name: string): Promise<Report> {
  const off = await blocked("ingest");
  if (off) return { ok: false, files: [], crossIssues: [], fatal: off };
  const g = await guard(name, "upload", 10, 3600);
  if (!g.ok) return { ok: false, files: [], crossIssues: [], fatal: g.error };
  const r = await importTexts(texts, "upload", true);
  revalidatePath("/", "layout");
  return r;
}
