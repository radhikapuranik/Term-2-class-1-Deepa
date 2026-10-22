import { query } from "@/lib/db";

export async function GET(_: Request, ctx: RouteContext<"/api/receipt/[id]">) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const rows = await query<{ rule_trace: unknown }>("SELECT rule_trace FROM recommendations WHERE id=$1", [Number(id)]);
  if (!rows[0]) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ trace: rows[0].rule_trace });
}
