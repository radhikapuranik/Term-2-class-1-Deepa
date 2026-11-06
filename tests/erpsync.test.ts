import { beforeEach, describe, expect, it, vi } from "vitest";

type Line = { rec_id: number; sku_id: string; sku_name: string; qty: number; distributor_name: string };
type PoRow = { name: string; item_code: string };
const st = { desired: [] as Line[], rows: new Map<number, { status: string; po_name: string | null; detail: string | null; reference: string }>(), killed: false,
  po: null as null | { name: string; docstatus: number; items: PoRow[] }, suppliers: ["NutriFlow Distributors"] as string[], items: ["SKU001", "SKU002"] as string[],
  calls: [] as { path: string; method: string; json?: unknown }[] };

vi.mock("@/lib/db", () => ({
  transaction: async () => [],
  query: async (t: string, p: unknown[] = []) => {
    if (t.includes("FROM recommendations r JOIN skus")) return st.desired;
    if (t.includes("INSERT INTO erp_locks")) return [{ reference: "x" }];
    if (t.includes("INSERT INTO erp_sync")) { st.rows.set(Number(p[0]), { reference: String(p[1]), status: String(p[2]), po_name: (p[3] as string) ?? null, detail: (p[4] as string) ?? null }); return []; }
    if (t.includes("SELECT recommendation_id FROM erp_sync")) return [...st.rows.keys()].map((id) => ({ recommendation_id: id }));
    if (t.includes("DELETE FROM erp_sync")) { st.rows.delete(Number(p[0])); return []; }
    return [];
  },
}));
vi.mock("@/lib/kill", () => ({ blocked: async () => (st.killed ? "Demand Desk is switched off: test. Nothing was sent to ERPNext." : null) }));
vi.mock("@/lib/erpnext", async (orig) => ({
  ...(await orig<object>()),
  erpConfigured: () => true,
  efetch: async (path: string, init: { method?: string; json?: unknown } = {}) => {
    const method = init.method ?? "GET";
    st.calls.push({ path, method, json: init.json });
    const dec = decodeURIComponent(path);
    if (dec.startsWith("/api/resource/Company")) return { data: [{ name: "Freshroots" }] };
    if (dec.startsWith("/api/resource/Supplier") && method === "GET") return { data: st.suppliers.filter((s) => dec.includes(`"${s}"`)).map((name) => ({ name })) };
    if (dec.startsWith("/api/resource/Supplier") && method === "POST") { st.suppliers.push((init.json as { supplier_name: string }).supplier_name); return { data: { name: "NEWSUP" } }; }
    if (dec.startsWith("/api/resource/Item") && method === "GET") { const sku = /"item_code","=","([^"]*)"/.exec(dec)?.[1]; return { data: sku && st.items.includes(sku) ? [{ name: sku, last_purchase_rate: 12 }] : [] }; }
    if (dec.startsWith("/api/resource/Item") && method === "POST") { st.items.push((init.json as { item_code: string }).item_code); return { data: { name: (init.json as { item_code: string }).item_code } }; }
    if (dec.startsWith("/api/resource/Purchase Order?")) return { data: st.po ? [{ name: st.po.name }] : [] };
    if (dec.startsWith("/api/resource/Purchase Order/") && method === "GET") return { data: { name: st.po!.name, docstatus: st.po!.docstatus, items: st.po!.items } };
    if (dec === "/api/resource/Purchase Order" && method === "POST") { st.po = { name: "PUR-ORD-0001", docstatus: 0, items: (init.json as { items: { item_code: string }[] }).items.map((i, n) => ({ name: `row${n}`, item_code: i.item_code })) }; return { data: { name: "PUR-ORD-0001" } }; }
    if (dec.startsWith("/api/resource/Purchase Order/") && method === "PUT") { st.po!.items = (init.json as { items: { item_code: string }[] }).items.map((i, n) => ({ name: `row${n}`, item_code: i.item_code })); return { data: { name: "PUR-ORD-0001" } }; }
    if (dec.startsWith("/api/resource/Purchase Order/") && method === "DELETE") { st.po = null; return {}; }
    return {};
  },
}));

import { reconcile, poReference, parseReference } from "@/lib/erpSync";

const L = (id: number, sku: string, qty: number): Line => ({ rec_id: id, sku_id: sku, sku_name: `Freshroots ${sku}`, qty, distributor_name: "NutriFlow Distributors" });
const creates = () => st.calls.filter((c) => c.method === "POST" && c.path === "/api/resource/Purchase Order");
beforeEach(() => {
  Object.assign(st, { desired: [], po: null, killed: false, suppliers: ["NutriFlow Distributors"], items: ["SKU001", "SKU002"], calls: [] });
  st.rows.clear();
});

describe("ERPNext draft purchase orders follow approvals", () => {
  it("reference is DD-<run>-<distributor> and parses back", () => {
    expect(poReference(7, "DIST001")).toBe("DD-7-DIST001");
    expect(parseReference("DD-7-DIST001")).toEqual({ orderRun: 7, distributorId: "DIST001" });
  });
  it("one approved line creates one draft PO using the item's ERPNext rate, titled with the reference", async () => {
    st.desired = [L(1, "SKU001", 750)];
    await reconcile(7, "DIST001");
    expect(creates()).toHaveLength(1);
    const body = creates()[0].json as { title: string; items: { qty: number; rate: number }[]; supplier: string };
    expect(body.title).toBe("DD-7-DIST001");
    expect(body.items[0]).toMatchObject({ qty: 750, rate: 12 });
    expect(st.rows.get(1)).toMatchObject({ status: "draft", po_name: "PUR-ORD-0001" });
  });
  it("two SKUs from one distributor make ONE PO with two lines; a later approval updates it, never duplicates", async () => {
    st.desired = [L(1, "SKU001", 750)];
    await reconcile(7, "DIST001");
    st.desired = [L(1, "SKU001", 750), L(2, "SKU002", 200)];
    await reconcile(7, "DIST001");
    expect(creates()).toHaveLength(1);
    expect((st.calls.find((c) => c.method === "PUT")!.json as { items: unknown[] }).items).toHaveLength(2);
  });
  it("a disapproved or undone line is removed from the draft; with none left the draft is deleted", async () => {
    st.desired = [L(1, "SKU001", 750), L(2, "SKU002", 200)];
    await reconcile(7, "DIST001");
    st.desired = [L(1, "SKU001", 750)];
    await reconcile(7, "DIST001");
    expect((st.calls.filter((c) => c.method === "PUT").at(-1)!.json as { items: unknown[] }).items).toHaveLength(1);
    expect(st.rows.has(2)).toBe(false);
    st.desired = [];
    await reconcile(7, "DIST001");
    expect(st.calls.some((c) => c.method === "DELETE")).toBe(true);
    expect(st.po).toBeNull();
  });
  it("never touches a PO that is already submitted", async () => {
    st.po = { name: "PUR-ORD-0009", docstatus: 1, items: [] };
    st.desired = [L(1, "SKU001", 750)];
    await reconcile(7, "DIST001");
    expect(st.calls.some((c) => ["PUT", "DELETE", "POST"].includes(c.method))).toBe(false);
    expect(st.rows.get(1)?.status).toBe("failed");
    expect(st.rows.get(1)?.detail).toMatch(/already submitted/);
  });
  it("never submits, cancels or amends (docstatus is never set to 1)", async () => {
    st.desired = [L(1, "SKU001", 750)];
    await reconcile(7, "DIST001");
    expect(st.calls.some((c) => /submit|cancel|amend/i.test(c.path) || /docstatus/.test(JSON.stringify(c.json ?? "")))).toBe(false);
  });
  it("a missing supplier or item waits for a yes, and is created only after it", async () => {
    st.suppliers = []; st.items = ["SKU001"];
    st.desired = [L(1, "SKU001", 750), L(2, "SKU002", 200)];
    await reconcile(7, "DIST001");
    expect(creates()).toHaveLength(0);
    expect(st.rows.get(1)?.status).toBe("needs_yes");
    expect(st.calls.some((c) => c.method === "POST")).toBe(false);
    await reconcile(7, "DIST001", { createMissing: true });
    expect(st.calls.some((c) => c.method === "POST" && c.path.includes("/Supplier"))).toBe(true);
    expect(creates()).toHaveLength(1);
  });
  it("respects the kill switch: nothing is sent to ERPNext", async () => {
    st.killed = true; st.desired = [L(1, "SKU001", 750)];
    await reconcile(7, "DIST001");
    expect(st.calls).toHaveLength(0);
    expect(st.rows.get(1)?.status).toBe("paused");
  });
});
