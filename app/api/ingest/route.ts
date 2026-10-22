import { safeEqual } from "@/lib/auth";
import { KINDS, importTexts } from "@/lib/importer";
import type { CsvKind } from "@/lib/csv";

export const maxDuration = 60;
const MAX_BYTES = 4_000_000;

function authorised(req: Request) {
  const token = process.env.INGEST_TOKEN ?? "";
  if (!token) return false;
  const h = req.headers.get("authorization") ?? "";
  const given = h.startsWith("Bearer ") ? h.slice(7) : req.headers.get("x-ingest-token") ?? "";
  return given.length > 0 && safeEqual(given, token);
}

/** IT pushes the SAP export here. JSON {sales, inventory, skus, distributors, calendar} (CSV text) or multipart files with those names. */
export async function POST(req: Request) {
  if (!authorised(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) return Response.json({ error: "Payload too large (4 MB max)" }, { status: 413 });
  const texts: Partial<Record<CsvKind, string>> = {};
  try {
    const type = req.headers.get("content-type") ?? "";
    if (type.includes("multipart/form-data")) {
      const form = await req.formData();
      for (const k of KINDS) { const f = form.get(k); if (f instanceof File) texts[k] = await f.text(); else if (typeof f === "string") texts[k] = f; }
    } else {
      const body = await req.json();
      for (const k of KINDS) if (typeof body?.[k] === "string") texts[k] = body[k];
    }
  } catch {
    return Response.json({ error: "Could not read the request. Send JSON or multipart form data." }, { status: 400 });
  }
  const report = await importTexts(texts, "api", true);
  return Response.json(report, { status: report.ok ? 200 : 422 });
}
