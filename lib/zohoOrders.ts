import { query } from "./db";
import { blocked } from "./kill";
import { orderLines, type OrderLine } from "./orders";
import { ZohoError, hosts, zfetch } from "./zoho";

export interface DraftResult {
  distributor_id: string; distributor_name: string; reference: string;
  outcome: "created" | "duplicate" | "skipped";
  detail: string; po_number?: string;
}
export interface PushReport { ok: boolean; message: string; results: DraftResult[]; unmatched: string[] }

export const poReference = (runId: number, distributorId: string) => `DD-${runId}-${distributorId}`;

const org = () => encodeURIComponent(process.env.ZOHO_ORG_ID ?? "");
const q = (s: string) => encodeURIComponent(s);

async function findVendor(name: string): Promise<string | null> {
  const j = await zfetch<{ contacts?: { contact_id: string; contact_name: string }[] }>(`${hosts().api}/inventory/v1/contacts?organization_id=${org()}&contact_type=vendor&contact_name_contains=${q(name)}`);
  return j.contacts?.find((c) => c.contact_name.trim().toLowerCase() === name.trim().toLowerCase())?.contact_id ?? null;
}
async function findItem(l: OrderLine): Promise<{ id: string; rate: number } | null> {
  for (const filter of [`sku=${q(l.sku_id)}`, `name=${q(l.sku_name)}`]) {
    const j = await zfetch<{ items?: { item_id: string; purchase_rate?: number; rate?: number }[] }>(`${hosts().api}/inventory/v1/items?organization_id=${org()}&${filter}`);
    const it = j.items?.[0];
    if (it) return { id: it.item_id, rate: it.purchase_rate ?? it.rate ?? 0 };
  }
  return null;
}
async function existingPo(reference: string): Promise<{ po_number?: string } | null> {
  const j = await zfetch<{ purchaseorders?: { purchaseorder_number?: string }[] }>(`${hosts().api}/inventory/v1/purchaseorders?organization_id=${org()}&reference_number=${q(reference)}`);
  return j.purchaseorders?.[0] ? { po_number: j.purchaseorders[0].purchaseorder_number } : null;
}

/** Creates one DRAFT purchase order per distributor. Never confirms or sends a PO. Safe to press twice. */
export async function pushDrafts(who: string): Promise<PushReport> {
  const off = await blocked("zoho");
  if (off) return { ok: false, message: off, results: [], unmatched: [] };
  if (!process.env.ZOHO_ORG_ID) return { ok: false, message: "Zoho is not ready: the Zoho organisation ID is not set. In Zoho Inventory open Settings, then Organisation Profile, copy the Organisation ID, and put it on the ZOHO_ORG_ID line.", results: [], unmatched: [] };
  const { runId, lines } = await orderLines();
  if (!runId || lines.length === 0) return { ok: false, message: "There are no approved lines to send yet.", results: [], unmatched: [] };
  const groups = new Map<string, OrderLine[]>();
  for (const l of lines) groups.set(l.distributor_id, [...(groups.get(l.distributor_id) ?? []), l]);
  const results: DraftResult[] = [];
  const unmatched: string[] = [];
  try {
    for (const [dist, ls] of groups) {
      const name = ls[0].distributor_name, reference = poReference(runId, dist);
      const base = { distributor_id: dist, distributor_name: name, reference };
      const done = await query<{ po_number: string | null }>("SELECT po_number FROM zoho_pushes WHERE reference=$1", [reference]);
      const remote = done[0] ? null : await existingPo(reference);
      if (done[0] || remote) {
        results.push({ ...base, outcome: "duplicate", detail: "A draft with this reference already exists, so nothing new was created.", po_number: done[0]?.po_number ?? remote?.po_number });
        continue;
      }
      const vendor = await findVendor(name);
      if (!vendor) { unmatched.push(`Vendor "${name}" was not found in Zoho, so its order was skipped.`); results.push({ ...base, outcome: "skipped", detail: "Vendor not found in Zoho." }); continue; }
      const items: { item_id: string; quantity: number; rate: number }[] = [];
      for (const l of ls) {
        const it = await findItem(l);
        if (!it) { unmatched.push(`Item ${l.sku_id} (${l.sku_name}) was not found in Zoho, so that line was skipped.`); continue; }
        items.push({ item_id: it.id, quantity: l.qty, rate: it.rate });
      }
      if (items.length === 0) { results.push({ ...base, outcome: "skipped", detail: "None of its items were found in Zoho." }); continue; }
      const created = await zfetch<{ purchaseorder?: { purchaseorder_id: string; purchaseorder_number: string } }>(
        `${hosts().api}/inventory/v1/purchaseorders?organization_id=${org()}`,
        { method: "POST", json: { vendor_id: vendor, reference_number: reference, date: new Date().toISOString().slice(0, 10), line_items: items, notes: `Draft from Demand Desk run #${runId}, created by ${who}. Please review before confirming.` } });
      const po = created.purchaseorder;
      await query("INSERT INTO zoho_pushes (reference, run_id, distributor_id, po_id, po_number, status) VALUES ($1,$2,$3,$4,$5,'draft') ON CONFLICT DO NOTHING", [reference, runId, dist, po?.purchaseorder_id ?? null, po?.purchaseorder_number ?? null]);
      results.push({ ...base, outcome: "created", detail: `Draft created with ${items.length} line(s).`, po_number: po?.purchaseorder_number });
    }
  } catch (e) {
    const easy = e instanceof ZohoError ? e.easy : (e as Error).message;
    return { ok: false, message: `Zoho stopped the push: ${easy}`, results, unmatched };
  }
  const created = results.filter((r) => r.outcome === "created").length;
  return { ok: true, message: created ? `${created} draft purchase order(s) created in Zoho. Nothing was confirmed or sent.` : "No new drafts were created.", results, unmatched };
}
