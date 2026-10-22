import { query } from "./db";

export interface Kill { on: boolean; reason: string; at: string; by: string }
export type Feature = "cron" | "run" | "ingest" | "gemini" | "alerts";

export async function getKill(): Promise<Kill | null> {
  const r = await query<{ value: Kill }>("SELECT value FROM app_state WHERE key='kill'");
  return r[0]?.value?.on ? r[0].value : null;
}

const WHAT: Record<Feature, string> = {
  cron: "The scheduled run was skipped.", run: "Run now is disabled.", ingest: "Data pushes are refused. Nothing was saved.",
  gemini: "Gemini was not called; plain explanations are shown.", alerts: "No alert email or bell message was sent.",
};
export const killMessage = (k: Kill, f: Feature) => `Demand Desk is switched off: ${k.reason}. ${WHAT[f]} Switch it back on from the Impact page.`;

/** Returns a plain-English message if the kill switch is on for this feature, otherwise null. */
export async function blocked(f: Feature): Promise<string | null> {
  const k = await getKill();
  return k ? killMessage(k, f) : null;
}

export async function setKill(reason: string, by: string) {
  const value: Kill = { on: true, reason: reason.trim().slice(0, 200), at: new Date().toISOString(), by };
  await query("INSERT INTO app_state (key, value) VALUES ('kill',$1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()", [JSON.stringify(value)]);
  await query("INSERT INTO kill_log (action, reason, by_name) VALUES ('kill',$1,$2)", [value.reason, by]);
}

export async function reviveKill(by: string) {
  await query("INSERT INTO app_state (key, value) VALUES ('kill','{\"on\":false}') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()");
  await query("INSERT INTO kill_log (action, reason, by_name) VALUES ('revive','Switched back on',$1)", [by]);
}
