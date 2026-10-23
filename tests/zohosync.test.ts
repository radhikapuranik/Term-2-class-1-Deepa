import { beforeEach, describe, expect, it, vi } from "vitest";

type Line = { rec_id: number; sku_id: string; sku_name: string; qty: number; distributor_name: string };
const st = { desired: [] as Line[], rows: new Map<number, { status: string; po_number: string | null; detail: string | null; reference: string }>(), killed: false,
  po: null as null | { id: string; status: string; lines: { line_item_id: string; item_id: string }[] }, vendors: ["NutriFlow Distributors"] as string[], items: ["SKU001", "SKU002"] as string[], calls: [] as { url: string; method: string; json?: unknown }[] };

vi.mock("@/lib/db", () => ({
  transaction: async () => [],
  query: async (t: string, p: unknown[] = []) => {
    if (t.includes("FROM recommendations r JOIN skus")) return st.desired;
    if (t.includes("INSERT INTO zoho_locks")) return [{ reference: "x" }];
    if (t.includes("INSERT INTO zoho_sync")) { st.rows.set(Number(p[0]), { reference: String(p[1]), status: String(p[2]), po_number: (p[4] as string) ?? null, detail: (p[5] as string) ?? null }); return []; }
    if (t.includes("SELECT recommendation_id FROM zoho_sync")) return [...st.rows.keys()].map((id) => ({ recommendation_id: id }));
    if (t.includes("DELETE FROM zoho_sync")) { st.rows.delete(Number(p[0])); return []; }
    return [];
  },
}));
vi.mock("@/lib/kill", () => ({ blocked: async () => (st.killed ? "Demand Desk is switched off: test. Nothing was sent to Zoho." : null) }));
vi.mock("@/lib/zoho", async (orig) => ({
  ...(await orig<object>()),
  zohoConfigured: () => true,
  zfetch: async (url: string, init: { method?: string; json?: unknown } = {}) => {
    const method = init.method ?? "GET";
    st.calls.push({ url, method, json: init.json });
    if (url.includes("/contacts") && method === "GET") return { contacts: st.vendors.filter((v) => url.includes(encodeURIComponent(v))).map((v) => ({ contact_id: "V1", contact_name: v })) };
    if (url.includes("/contacts") && method === "POST") { st.vendors.push((init.json as { contact_name: string }).contact_name); return { contact: { contact_id: "V2" } }; }
    if (url.includes("/items") && method === "GET") { const sku = decodeURIComponent(/sku=([^&]*)/.exec(url)?.[1] ?? ""); return { items: st.items.includes(sku) ? [{ item_id: `I-${sku}`, purchase_rate: 12 }] : [] }; }
    if (url.includes("/items") && method === "POST") { st.items.push((init.json as { sku: string }).sku); return { item: { item_id: "NEW" } }; }
    if (url.includes("/purchaseorders") && method === "GET" && /reference_number=/.test(url)) return { purchaseorders: st.po ? [{ purchaseorder_id: st.po.id }] : [] };
    if (url.includes("/purchaseorders/") && method === "GET") return { purchaseorder: { purchaseorder_number: "PO-1", status: st.po!.status, line_items: st.po!.lines } };
    if (url.includes("/purchaseorders") && method === "POST") { st.po = { id: "PO1", status: "draft", lines: [] }; return { purchaseorder: { purchaseorder_id: "PO1", purchaseorder_number: "PO-1" } }; }
    if (url.includes("/purchaseorders/") && method === "PUT") return { purchaseorder: { purchaseorder_id: "PO1", purchaseorder_number: "PO-1" } };
    if (url.includes("/purchaseorders/") && method === "DELETE") { st.po = null; return {}; }
    return {};
  },
}));

import { reconcile, poReference, parseReference } from "@/lib/zohoSync";

const L = (id: number, sku: string, qty: number): Line => ({ rec_id: id, sku_id: sku, sku_name: `Freshroots ${sku}`, qty, distributor_name: "NutriFlow Distributors" });
const posts = () => st.calls.filter((c) => c.method === "POST" && c.url.includes("/purchaseorders"));
beforeEach(() => {
  Object.assign(st, { desired: [], po: null, killed: false, vendors: ["NutriFlow Distributors"], items: ["SKU001", "SKU002"], calls: [] });
  st.rows.clear();
  Object.assign(process.env, { ZOHO_ORG_ID: "99", ZOHO_CLIENT_ID: "a", ZOHO_CLIENT_SECRET: "b", ZOHO_REFRESH_TOKEN: "c" });
});

describe("Zoho draft purchase orders follow approvals", () => {
  it("reference is DD-<run>-<distributor> and parses back", () => {
    expect(poReference(7, "DIST001")).toBe("DD-7-DIST001");
    expect(parseReference("DD-7-DIST001")).toEqual({ orderRun: 7, distributorId: "DIST001" });
  });
  it("one approved line creates one draft PO with the item's Zoho rate", async () => {
    st.desired = [L(1, "SKU001", 750)];
    await reconcile(7, "DIST001");
    expect(posts()).toHaveLength(1);
    expect((posts()[0].json as { line_items: { quantity: number; rate: number }[]; reference_number: string }).line_items[0]).toMatchObject({ quantity: 750, rate: 12 });
    expect((posts()[0].json as { reference_number: string }).reference_number).toBe("DD-7-DIST001");
    expect(st.rows.get(1)?.status).toBe("draft");
  });
  it("two SKUs from one distributor make ONE PO with two lines, and a second approval updates it instead of duplicating", async () => {
    st.desired = [L(1, "SKU001", 750)];
    await reconcile(7, "DIST001");
    st.desired = [L(1, "SKU001", 750), L(2, "SKU002", 200)];
    await reconcile(7, "DIST001");
    expect(posts()).toHaveLength(1);
    const put = st.calls.find((c) => c.method === "PUT")!;
    expect((put.json as { line_items: unknown[] }).line_items).toHaveLength(2);
  });
  it("a disapproved or undone line is removed from the draft; with no lines left the draft is deleted", async () => {
    st.desired = [L(1, "SKU001", 750), L(2, "SKU002", 200)];
    await reconcile(7, "DIST001");
    st.desired = [L(1, "SKU001", 750)];
    await reconcile(7, "DIST001");
    expect((st.calls.filter((c) => c.method === "PUT").at(-1)!.json as { line_items: unknown[] }).line_items).toHaveLength(1);
    expect(st.rows.has(2)).toBe(false);
    st.desired = [];
    await reconcile(7, "DIST001");
    expect(st.calls.some((c) => c.method === "DELETE")).toBe(true);
    expect(st.po).toBeNull();
  });
  it("never touches a PO that is no longer a draft", async () => {
    st.po = { id: "PO1", status: "issued", lines: [] };
    st.desired = [L(1, "SKU001", 750)];
    await reconcile(7, "DIST001");
    expect(st.calls.some((c) => c.method === "PUT" || c.method === "DELETE" || c.method === "POST")).toBe(false);
    expect(st.rows.get(1)?.status).toBe("failed");
    expect(st.rows.get(1)?.detail).toMatch(/already confirmed/);
  });
  it("never calls confirm, issue, send or status endpoints", async () => {
    st.desired = [L(1, "SKU001", 750)];
    await reconcile(7, "DIST001");
    expect(st.calls.some((c) => /status|confirm|issue|sent|approve/i.test(c.url))).toBe(false);
  });
  it("a missing vendor or item waits for a yes, and is created only after it", async () => {
    st.vendors = []; st.items = ["SKU001"];
    st.desired = [L(1, "SKU001", 750), L(2, "SKU002", 200)];
    await reconcile(7, "DIST001");
    expect(posts()).toHaveLength(0);
    expect(st.rows.get(1)?.status).toBe("needs_yes");
    expect(st.calls.some((c) => c.method === "POST")).toBe(false);
    await reconcile(7, "DIST001", { createMissing: true });
    expect(st.calls.some((c) => c.method === "POST" && c.url.includes("/contacts"))).toBe(true);
    expect(posts()).toHaveLength(1);
  });
  it("respects the kill switch: nothing is sent to Zoho", async () => {
    st.killed = true; st.desired = [L(1, "SKU001", 750)];
    await reconcile(7, "DIST001");
    expect(st.calls).toHaveLength(0);
    expect(st.rows.get(1)?.status).toBe("paused");
  });
});
