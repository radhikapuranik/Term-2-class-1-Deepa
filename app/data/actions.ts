"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { CsvKind } from "@/lib/csv";
import { importTexts, type Report } from "@/lib/importer";

export async function checkFiles(texts: Partial<Record<CsvKind, string>>): Promise<Report> {
  return importTexts(texts, "upload", false);
}

export async function saveFiles(texts: Partial<Record<CsvKind, string>>): Promise<Report> {
  const who = await requireUser().catch(() => null);
  if (!who) return { ok: false, files: [], crossIssues: [], fatal: "Sign in with the passcode to upload." };
  const r = await importTexts(texts, "upload", true);
  revalidatePath("/", "layout");
  return r;
}
