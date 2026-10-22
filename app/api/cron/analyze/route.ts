import { safeEqual } from "@/lib/security";
import { query } from "@/lib/db";
import { blocked } from "@/lib/kill";
import { runAnalysis } from "@/lib/pipeline";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Called by Vercel Cron (Mon and Thu 08:00 IST). Vercel sends "Authorization: Bearer $CRON_SECRET". */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const h = req.headers.get("authorization") ?? "";
  if (!secret || !h.startsWith("Bearer ") || !safeEqual(h.slice(7), secret)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const off = await blocked("cron");
  if (off) return Response.json({ ok: false, switchedOff: true, message: off }, { status: 503 });
  const recent = await query<{ id: number }>("SELECT id FROM runs WHERE trigger_type='cron' AND status='ok' AND started_at > now() - interval '6 hours' LIMIT 1");
  if (recent[0]) return Response.json({ ok: true, skipped: true, reason: "A scheduled run already finished in the last 6 hours", runId: recent[0].id });
  try {
    const { runId, out } = await runAnalysis("cron");
    return Response.json({ ok: true, runId, summary: out.summary });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message.slice(0, 200) }, { status: 500 });
  }
}
