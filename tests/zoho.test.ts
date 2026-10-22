import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeDb } from "./fakedb";

const pushes = new Map<string, { po_number: string | null }>();
const db = makeDb([
  (t) => (t.includes("FROM zoho_pushes") ? [] : undefined),
]);
const dbQuery = vi.fn(async (t: string, p: unknown[] = []) => {
  if (t.includes("SELECT po_number FROM zoho_pushes")) { const r = pushes.get(String(p[0])); return r ? [r] : []; }
  if (t.includes("INSERT INTO zoho_pushes")) { pushes.set(String(p[0]), { po_number: String(p[4]) }); return []; }
  return db.query(t, p);
});
vi.mock("@/lib/db", () => ({ query: (t: string, p?: unknown[]) => dbQuery(t, p ?? []), transaction: async () => [] }));
vi.mock("@/lib/kill", () => ({ blocked: async () => null }));
vi.mock("@/lib/orders", () => ({
  orderLines: async () => ({ runId: 7, lines: [
    { sku_id: "SKU001", sku_name: "Freshroots Mango Drink 200ml", distributor_id: "DIST001", distributor_name: "NutriFlow Distributors", qty: 750, unit: "Units", status: "Approved", note: null },
    { sku_id: "SKU003", sku_name: "Freshroots Brown Rice 1kg", distributor_id: "DIST002", distributor_name: "GrainPath Logistics", qty: 300, unit: "Units", status: "Approved", note: null },
  ] }),
}));
const calls: { url: string; method: string }[] = [];
vi.mock("@/lib/zoho", async (orig) => ({
  ...(await orig<object>()),
  zfetch: async (url: string, init: { method?: string } = {}) => {
    calls.push({ url, method: init.method ?? "GET" });
    if (url.includes("/contacts")) return { contacts: url.includes("NutriFlow") ? [{ contact_id: "V1", contact_name: "NutriFlow Distributors" }] : [] };
    if (url.includes("/items")) return { items: [{ item_id: "I1", purchase_rate: 10 }] };
    if (url.includes("/purchaseorders") && (init.method ?? "GET") === "GET") return { purchaseorders: [] };
    return { purchaseorder: { purchaseorder_id: "PO1", purchaseorder_number: "PO-0001" } };
  },
}));

import { pushDrafts, poReference } from "@/lib/zohoOrders";

beforeEach(() => { pushes.clear(); calls.length = 0; process.env.ZOHO_ORG_ID = "99"; });

describe("Zoho draft purchase orders", () => {
  it("uses the reference DD-<run>-<distributor>", () => expect(poReference(7, "DIST001")).toBe("DD-7-DIST001"));
  it("creates one draft, skips the unmatched vendor in plain English, and never confirms", async () => {
    const r = await pushDrafts("Tester");
    expect(r.ok).toBe(true);
    expect(r.results.find((x) => x.distributor_id === "DIST001")?.outcome).toBe("created");
    expect(r.results.find((x) => x.distributor_id === "DIST002")?.outcome).toBe("skipped");
    expect(r.unmatched.join(" ")).toMatch(/GrainPath Logistics.*not found in Zoho/);
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(1);
    expect(calls.some((c) => /status|confirm|sent|approve/i.test(c.url))).toBe(false);
  });
  it("does not create a duplicate when pressed twice", async () => {
    await pushDrafts("Tester");
    calls.length = 0;
    const again = await pushDrafts("Tester");
    expect(again.results.find((x) => x.distributor_id === "DIST001")?.outcome).toBe("duplicate");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });
  it("explains a missing organisation id in easy words", async () => {
    delete process.env.ZOHO_ORG_ID;
    expect((await pushDrafts("T")).message).toMatch(/Organisation ID/);
  });
});
