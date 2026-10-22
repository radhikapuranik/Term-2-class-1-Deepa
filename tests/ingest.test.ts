import { beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/ingest/route";
import { checkPasscode } from "@/lib/auth";

beforeAll(() => { process.env.INGEST_TOKEN = "t0ken-for-tests"; process.env.DESK_PASSCODE = "pass-for-tests"; });
const req = (headers: Record<string, string>, body: unknown = {}) =>
  new Request("http://x/api/ingest", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("/api/ingest", () => {
  it("rejects a missing token", async () => expect((await POST(req({}))).status).toBe(401));
  it("rejects a wrong token", async () => expect((await POST(req({ authorization: "Bearer nope" }))).status).toBe(401));
  it("rejects a bad CSV with a clear message and saves nothing", async () => {
    const res = await POST(req({ authorization: "Bearer t0ken-for-tests" }, { sales: "SKU_ID,Week,Units_Sold\nSKU001,2026-W99,5\n" }));
    const j = await res.json();
    expect(res.status).toBe(422);
    expect(j.fatal).toMatch(/Nothing was saved/);
    expect(j.files[0].errors[0]).toMatch(/not a valid ISO week/);
  });
  it("rejects an empty request", async () => expect((await POST(req({ authorization: "Bearer t0ken-for-tests" }, {}))).status).toBe(422));
});

describe("passcode", () => {
  it("accepts the right one and rejects others", () => {
    expect(checkPasscode("pass-for-tests")).toBe(true);
    expect(checkPasscode("wrong")).toBe(false);
    expect(checkPasscode("")).toBe(false);
  });
});
