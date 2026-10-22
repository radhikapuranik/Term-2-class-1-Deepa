import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeDb } from "./fakedb";

const state: { kill: unknown } = { kill: null };
const log: unknown[] = [];
const db = makeDb([
  (t) => (t.includes("SELECT value FROM app_state") ? (state.kill ? [{ value: state.kill }] : []) : undefined),
  (t, p) => { if (t.includes("INSERT INTO app_state")) { state.kill = JSON.parse(String(p[0] ?? '{"on":false}')); return []; } },
  (t, p) => { if (t.includes("INSERT INTO kill_log")) { log.push(p); return []; } },
]);
vi.mock("@/lib/db", () => ({ query: (t: string, p?: unknown[]) => db.query(t, p ?? []), transaction: async () => [] }));
vi.mock("@/lib/pipeline", () => ({ runAnalysis: vi.fn(async () => ({ runId: 1, out: { summary: {} } })) }));
vi.mock("@/lib/security", async (orig) => ({ ...(await orig<object>()), rateLimit: async () => ({ ok: true, retryIn: 0 }), guard: async () => ({ ok: true, who: "Tester" }) }));

import { blocked, getKill, reviveKill, setKill, type Feature } from "@/lib/kill";
import { GET as cron } from "@/app/api/cron/analyze/route";
import { POST as ingest } from "@/app/api/ingest/route";
import { runNow } from "@/app/run-now";
import { pushDrafts } from "@/lib/zohoOrders";
import { explainOne } from "@/lib/gemini";
import { sendDigest } from "@/lib/email";
import { runEngine } from "@/lib/rules/engine";
import { DEFAULT_SETTINGS } from "@/lib/rules/types";
import { loadSeedFiles } from "@/lib/seed-data";

beforeEach(() => { process.env.CRON_SECRET = "cron-secret"; process.env.INGEST_TOKEN = "ingest-token"; state.kill = null; log.length = 0; });

describe("kill switch", () => {
  it("is off by default and blocks nothing", async () => {
    for (const f of ["cron", "run", "ingest", "gemini", "alerts", "zoho"] as Feature[]) expect(await blocked(f)).toBeNull();
  });
  it("gives a clear message for every feature once switched off, and logs kill and revive", async () => {
    await setKill("override rate too high", "Raghav");
    for (const f of ["cron", "run", "ingest", "gemini", "alerts", "zoho"] as Feature[]) expect(await blocked(f)).toMatch(/switched off: override rate too high/);
    expect((await getKill())?.by).toBe("Raghav");
    await reviveKill("Raghav");
    expect(await getKill()).toBeNull();
    expect(log.length).toBe(2);
  });
  it("blocks the cron route, ingest, Run now and Zoho pushes", async () => {
    await setKill("test", "T");
    const c = await cron(new Request("http://x/api/cron/analyze", { headers: { authorization: "Bearer cron-secret" } }));
    expect(c.status).toBe(503);
    const i = await ingest(new Request("http://x/api/ingest", { method: "POST", headers: { authorization: "Bearer ingest-token", "content-type": "application/json" }, body: "{}" }));
    expect(i.status).toBe(503);
    expect((await runNow("Tester")).message).toMatch(/switched off/);
    process.env.ZOHO_ORG_ID = "1";
    expect((await pushDrafts("T")).message).toMatch(/switched off/);
  });
  it("stops Gemini calls (plain template) and alert emails", async () => {
    await setKill("test", "T");
    const out = runEngine({ ...loadSeedFiles(), settings: DEFAULT_SETTINGS });
    const r = out.results.find((x) => x.sku_id === "SKU003")!;
    expect((await explainOne(r, true)).status).toBe("fallback");
    expect((await sendDigest(out, 1)).error).toBe("Switched off");
  });
  it("still lets the cron secret check run first (no secret, 401)", async () => {
    await setKill("test", "T");
    expect((await cron(new Request("http://x/api/cron/analyze"))).status).toBe(401);
  });
});
