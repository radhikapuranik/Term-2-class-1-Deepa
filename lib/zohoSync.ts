import { query } from "./db";
import { blocked } from "./kill";
import { ZohoError, hosts, zfetch, zohoConfigured } from "./zoho";

/** Draft purchase orders in Zoho Inventory: one DRAFT per distributor per run, kept in step with approvals. Never confirms, issues or sends a PO. */

export const zohoReady = () => zohoConfigured() && !!process.env.ZOHO_ORG_ID;
export const poReference = (orderRun: number, distributorId: string) => `DD-${orderRun}-${distributorId}`;
export const parseReference = (ref: string) => { const m = /^DD-(\d+)-(.+)$/.exec(ref); return m ? { orderRun: Number(m[1]), distributorId: m[2] } : null; };
export const poLink = (poId: string) => `https://inventory.zoho.${process.env.ZOHO_DC || "in"}/app/${process.env.ZOHO_ORG_ID}#/purchaseorders/${poId}`;

const org = () => encodeURIComponent(process.env.ZOHO_ORG_ID ?? "");
const q = (s: string) => encodeURIComponent(s);
const inv = (path: string, extra = "") => `${hosts().api}/inventory/v1/${path}?organization_id=${org()}${extra}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Line { rec_id: number; sku_id: string; sku_name: string; qty: number; distributor_name: string }

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= 3; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (e instanceof ZohoError && [401, 403].includes(e.status)) break;
      if (i < 3) await sleep(600 * i);
    }
  }
  throw last;
}

async function findVendor(name: string): Promise<string | null> {
  const j = await zfetch<{ contacts?: { contact_id: string; contact_name: string }[] }>(inv("contacts", `&contact_type=vendor&contact_name_contains=${q(name)}`));
  return j.contacts?.find((c) => c.contact_name.trim().toLowerCase() === name.trim().toLowerCase())?.contact_id ?? null;
}
async function findItem(l: Pick<Line, "sku_id" | "sku_name">): Promise<{ id: string; rate: number } | null> {
  for (const f of [`sku=${q(l.sku_id)}`, `name=${q(l.sku_name)}`]) {
    const j = await zfetch<{ items?: { item_id: string; purchase_rate?: number; rate?: number }[] }>(inv("items", `&${f}`));
    const it = j.items?.[0];
    if (it) return { id: it.item_id, rate: it.purchase_rate ?? it.rate ?? 0 };
  }
  return null;
}
async function findPo(reference: string): Promise<{ id: string; number: string; status: string; lines: { line_item_id: string; item_id: string }[] } | null> {
  const list = await zfetch<{ purchaseorders?: { purchaseorder_id: string }[] }>(inv("purchaseorders", `&reference_number=${q(reference)}`));
  const id = list.purchaseorders?.[0]?.purchaseorder_id;
  if (!id) return null;
  const d = await zfetch<{ purchaseorder: { purchaseorder_number: string; status: string; line_items?: { line_item_id: string; item_id: string }[] } }>(inv(`purchaseorders/${id}`));
  return { id, number: d.purchaseorder.purchaseorder_number, status: d.purchaseorder.status, lines: d.purchaseorder.line_items ?? [] };
}

async function lock(reference: string): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    const r = await query("INSERT INTO zoho_locks (reference, locked_at) VALUES ($1, now()) ON CONFLICT (reference) DO UPDATE SET locked_at = now() WHERE zoho_locks.locked_at < now() - interval '60 seconds' RETURNING reference", [reference]);
    if (r.length) return true;
    await sleep(1000);
  }
  return false;
}
const unlock = (reference: string) => query("DELETE FROM zoho_locks WHERE reference=$1", [reference]);

async function setRows(ids: number[], reference: string, status: string, f: { po_id?: string | null; po_number?: string | null; detail?: string | null; missing?: unknown } = {}) {
  for (const id of ids) {
    await query(`INSERT INTO zoho_sync (recommendation_id, reference, status, po_id, po_number, detail, missing, attempts, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,1,now())
      ON CONFLICT (recommendation_id) DO UPDATE SET reference=EXCLUDED.reference, status=EXCLUDED.status, po_id=EXCLUDED.po_id, po_number=EXCLUDED.po_number,
        detail=EXCLUDED.detail, missing=EXCLUDED.missing, attempts=zoho_sync.attempts+1, updated_at=now()`,
      [id, reference, status, f.po_id ?? null, f.po_number ?? null, f.detail ?? null, f.missing ? JSON.stringify(f.missing) : null]);
  }
}

async function desiredLines(orderRun: number, dist: string): Promise<Line[]> {
  return query<Line>(
    `SELECT r.id AS rec_id, r.sku_id, s.sku_name, r.final_qty AS qty, COALESCE(d.distributor_name, s.distributor_id) AS distributor_name
     FROM recommendations r JOIN skus s ON s.sku_id=r.sku_id LEFT JOIN distributors d ON d.distributor_id=s.distributor_id
     WHERE r.run_id=(SELECT max(id) FROM runs WHERE status='ok') AND COALESCE(r.order_run_id, r.run_id)=$1 AND s.distributor_id=$2
       AND r.decision_status IN ('Approved','Edited') AND r.final_qty > 0 ORDER BY r.sku_id`, [orderRun, dist]);
}

/** Brings the one draft PO for (run, distributor) in line with the approved lines. Safe to call any number of times. */
export async function reconcile(orderRun: number, dist: string, opts: { createMissing?: boolean } = {}): Promise<void> {
  if (!zohoReady()) return;
  const reference = poReference(orderRun, dist);
  const lines = await desiredLines(orderRun, dist);
  const off = await blocked("zoho");
  if (off) { await setRows(lines.map((l) => l.rec_id), reference, "paused", { detail: off }); return; }
  if (!(await lock(reference))) { await setRows(lines.map((l) => l.rec_id), reference, "failed", { detail: "Zoho was busy with another update. Press Send to Zoho (draft) to try again." }); return; }
  try {
    await withRetry(() => doReconcile(reference, lines, dist, opts));
  } catch (e) {
    const easy = e instanceof ZohoError ? e.easy : (e as Error).message.slice(0, 160);
    await setRows(lines.map((l) => l.rec_id), reference, "failed", { detail: easy });
  } finally {
    await unlock(reference).catch(() => {});
  }
}

async function doReconcile(reference: string, lines: Line[], dist: string, opts: { createMissing?: boolean }) {
  const po = await findPo(reference);
  const keep = new Set(lines.map((l) => l.rec_id));
  const old = await query<{ recommendation_id: number }>("SELECT recommendation_id FROM zoho_sync WHERE reference=$1", [reference]);
  for (const o of old) if (!keep.has(Number(o.recommendation_id))) await query("DELETE FROM zoho_sync WHERE recommendation_id=$1", [o.recommendation_id]);
  if (lines.length === 0) {
    if (po && po.status === "draft") await zfetch(inv(`purchaseorders/${po.id}`), { method: "DELETE" });
    return;
  }
  if (po && po.status !== "draft") {
    await setRows(lines.map((l) => l.rec_id), reference, "failed", { po_id: po.id, po_number: po.number, detail: `PO ${po.number} is already confirmed in Zoho, so it was left alone. Change it there.` });
    return;
  }
  const name = lines[0].distributor_name;
  let vendor = await findVendor(name);
  if (!vendor && opts.createMissing) {
    const c = await zfetch<{ contact?: { contact_id: string } }>(inv("contacts"), { method: "POST", json: { contact_name: name, contact_type: "vendor" } });
    vendor = c.contact?.contact_id ?? null;
  }
  if (!vendor) {
    await setRows(lines.map((l) => l.rec_id), reference, "needs_yes", { missing: { vendor: name }, detail: `Vendor "${name}" is not in Zoho.` });
    return;
  }
  const items: { item_id: string; quantity: number; rate: number; line_item_id?: string }[] = [];
  const ok: number[] = [];
  for (const l of lines) {
    let it = await findItem(l);
    if (!it && opts.createMissing) {
      const c = await zfetch<{ item?: { item_id: string } }>(inv("items"), { method: "POST", json: { name: l.sku_name, sku: l.sku_id, rate: 0, purchase_rate: 0, item_type: "purchases" } });
      if (c.item?.item_id) it = { id: c.item.item_id, rate: 0 };
    }
    if (!it) { await setRows([l.rec_id], reference, "needs_yes", { missing: { item: `${l.sku_id} ${l.sku_name}` }, detail: `Item "${l.sku_name}" (${l.sku_id}) is not in Zoho.` }); continue; }
    items.push({ item_id: it.id, quantity: l.qty, rate: it.rate, line_item_id: po?.lines.find((x) => x.item_id === it!.id)?.line_item_id });
    ok.push(l.rec_id);
  }
  if (items.length === 0) return;
  const body = { vendor_id: vendor, reference_number: reference, date: new Date().toISOString().slice(0, 10), line_items: items, notes: "Draft from Demand Desk. Please review before confirming." };
  const saved = po
    ? await zfetch<{ purchaseorder?: { purchaseorder_id: string; purchaseorder_number: string } }>(inv(`purchaseorders/${po.id}`), { method: "PUT", json: body })
    : await zfetch<{ purchaseorder?: { purchaseorder_id: string; purchaseorder_number: string } }>(inv("purchaseorders"), { method: "POST", json: body });
  const p = saved.purchaseorder;
  await setRows(ok, reference, "draft", { po_id: p?.purchaseorder_id ?? po?.id ?? null, po_number: p?.purchaseorder_number ?? po?.number ?? null });
  void dist;
}

/** Marks a rec as waiting, so the Orders page shows "Sending to Zoho" at once. */
export async function markPending(recId: number) {
  if (!zohoReady()) return;
  const r = await query<{ ref: string | null; dist: string }>(
    "SELECT COALESCE(r.order_run_id, r.run_id)::text AS ref, s.distributor_id AS dist FROM recommendations r JOIN skus s ON s.sku_id=r.sku_id WHERE r.id=$1", [recId]);
  if (r[0]) await setRows([recId], poReference(Number(r[0].ref), r[0].dist), "pending");
}

/** Called in the background after any decision. Looks up the run and distributor of the rec and reconciles. */
export async function syncForRec(recId: number, opts: { createMissing?: boolean } = {}) {
  if (!zohoReady()) return;
  const r = await query<{ ref: string; dist: string }>(
    "SELECT COALESCE(r.order_run_id, r.run_id)::text AS ref, s.distributor_id AS dist FROM recommendations r JOIN skus s ON s.sku_id=r.sku_id WHERE r.id=$1", [recId]);
  if (r[0]) await reconcile(Number(r[0].ref), r[0].dist, opts);
}

/** Every (run, distributor) that has approved lines or an existing draft. Used by the manual button and after each run. */
export async function reconcileOpen(opts: { createMissing?: boolean } = {}) {
  if (!zohoReady()) return;
  const refs = await query<{ ref: string; dist: string }>(
    `SELECT DISTINCT COALESCE(r.order_run_id, r.run_id)::text AS ref, s.distributor_id AS dist FROM recommendations r JOIN skus s ON s.sku_id=r.sku_id
     WHERE r.run_id=(SELECT max(id) FROM runs WHERE status='ok') AND r.decision_status IN ('Approved','Edited') AND r.final_qty > 0`);
  const seen = new Set(refs.map((x) => poReference(Number(x.ref), x.dist)));
  const existing = await query<{ reference: string }>("SELECT DISTINCT reference FROM zoho_sync WHERE status='draft'");
  const all = [...refs.map((x) => ({ orderRun: Number(x.ref), distributorId: x.dist }))];
  for (const e of existing) { const p = parseReference(e.reference); if (p && !seen.has(e.reference)) all.push(p); }
  for (const t of all) await reconcile(t.orderRun, t.distributorId, opts);
}
