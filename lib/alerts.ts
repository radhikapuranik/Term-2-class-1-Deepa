import { query } from "./db";
import { blocked } from "./kill";

export const addAlert = (kind: string, message: string) => query("INSERT INTO alerts (kind, message) VALUES ($1,$2)", [kind, message]);
export async function unreadAlerts(): Promise<number> {
  const r = await query<{ n: number }>("SELECT count(*)::int AS n FROM alerts WHERE read=false");
  return r[0]?.n ?? 0;
}
export { blocked };
