import { query } from "./db";
import { ErpError, efetch, erpConfigured, erpLink, filters } from "./erpnext";
import { blocked } from "./kill";

/** Draft purchase orders in ERPNext: one DRAFT (docstatus 0) per distributor per run, kept in step with approvals. Never submits a PO. */

export const erpReady = () => erpConfigured();
export const poReference = (orderRun: number, distributorId: string) => `DD-${orderRun}-${distributorId}`;
export const parseReference = (ref: string) => { const m = /^DD-(\d+)-(.+)$/.exec(ref); return m ? { orderRun: Number(m[1]), distributorId: m[2] } : null; };
export const poLink = (name: string) => erpLink("Purchase Order", name);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PO = "/api/resource/Purchase Order";

interface Line { rec_id: number; sku_id: string; sku_name: string; qty: number; distributor_name: string }
type PoLine = { name: string; item_code: string };
type Po = { name: string; docstatus: number; items: PoLine[] };

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= 3; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (e instanceof ErpError && [401, 403, 417, 417].includes(e.status)) break;
      if (i < 3) await sleep(600 * i);
    }
  }
  throw last;
}

async function company(): Promise<string> {
  if (process.env.ERPNEXT_COMPANY) return process.env.ERPNEXT_COMPANY;
  const j = await efetch<{ data?: { name: string }[] }>("/api/resource/Company?limit_page_length=1");
  const c = j.data?.[0]?.name;
  if (!c) throw new ErpError("No company", 0, "ERPNext has no Company yet. Finish the ERPNext setup wizard first.");
  return c;
}
async function findSupplier(name: string): Promise<string | null> {
  const j = await efetch<{ data?: { name: string }[] }>(`/api/resource/Supplier?fields=["name"]&filters=${filters([["supplier_name", "=", name]])}`);
  return j.data?.[0]?.name ?? null;
}
async function findItem(l: Pick<Line, "sku_id" | "sku_name">): Promise<{ code: string; rate: number } | null> {
  for (const f of [["item_code", "=", l.sku_id], ["item_name", "=", l.sku_name]]) {
    const j = await efetch<{ data?: { name: string; last_purchase_rate?: number; standard_rate?: number; valuation_rate?: number }[] }>(
      `/api/resource/Item?fields=${encodeURIComponent('["name","last_purchase_rate","standard_rate","valuation_rate"]')}&filters=${filters([f])}`);
    const it = j.data?.[0];
    if (it) return { code: it.name, rate: it.last_purchase_rate || it.standard_rate || it.valuation_rate || 0 };
  }
  return null;
}
async function findPo(reference: string): Promise<Po | null> {
  const list = await efetch<{ data?: { name: string }[] }>(`${PO}?fields=["name"]&filters=${filters([["title", "=", reference], ["docstatus", "<", 2]])}`);
  const name = list.data?.[0]?.name;
  if (!name) return null;
  const d = await efetch<{ data: { name: string; docstatus: number; items?: PoLine[] } }>(`${PO}/${encodeURIComponent(name)}`);
  return { name: d.data.name, docstatus: d.data.docstatus, items: d.data.items ?? [] };
}

async function lock(reference: string): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    const r = await query("INSERT INTO erp_locks (reference, locked_at) VALUES ($1, now()) ON CONFLICT (reference) DO UPDATE SET locked_at = now() WHERE erp_locks.locked_at < now() - interval '60 seconds' RETURNING reference", [reference]);
    if (r.length) return true;
    await sleep(1000);
  }
  return false;
}
const unlock = (reference: string) => query("DELETE FROM erp_locks WHERE reference=$1", [reference]);

async function setRows(ids: number[], reference: string, status: string, f: { po_name?: string | null; detail?: string | null; missing?: unknown } = {}) {
  for (const id of ids) {
    await query(`INSERT INTO erp_sync (recommendation_id, reference, status, po_name, detail, missing, attempts, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,1,now())
      ON CONFLICT (recommendation_id) DO UPDATE SET reference=EXCLUDED.reference, status=EXCLUDED.status, po_name=EXCLUDED.po_name,
        detail=EXCLUDED.detail, missing=EXCLUDED.missing, attempts=erp_sync.attempts+1, updated_at=now()`,
      [id, reference, status, f.po_name ?? null, f.detail ?? null, f.missing ? JSON.stringify(f.missing) : null]);
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
  if (!erpReady()) return;
  const reference = poReference(orderRun, dist);
  const lines = await desiredLines(orderRun, dist);
  const off = await blocked("erp");
  if (off) { await setRows(lines.map((l) => l.rec_id), reference, "paused", { detail: off }); return; }
  if (!(await lock(reference))) { await setRows(lines.map((l) => l.rec_id), reference, "failed", { detail: "ERPNext was busy with another update. Press Send to ERPNext (draft) to try again." }); return; }
  try {
    await withRetry(() => doReconcile(reference, lines, opts));
  } catch (e) {
    await setRows(lines.map((l) => l.rec_id), reference, "failed", { detail: e instanceof ErpError ? e.easy : (e as Error).message.slice(0, 160) });
  } finally {
    await unlock(reference).catch(() => {});
  }
}

async function doReconcile(reference: string, lines: Line[], opts: { createMissing?: boolean }) {
  const po = await findPo(reference);
  const keep = new Set(lines.map((l) => l.rec_id));
  const old = await query<{ recommendation_id: number }>("SELECT recommendation_id FROM erp_sync WHERE reference=$1", [reference]);
  for (const o of old) if (!keep.has(Number(o.recommendation_id))) await query("DELETE FROM erp_sync WHERE recommendation_id=$1", [o.recommendation_id]);
  if (lines.length === 0) {
    if (po && po.docstatus === 0) await efetch(`${PO}/${encodeURIComponent(po.name)}`, { method: "DELETE" });
    return;
  }
  if (po && po.docstatus !== 0) {
    await setRows(lines.map((l) => l.rec_id), reference, "failed", { po_name: po.name, detail: `PO ${po.name} is already submitted in ERPNext, so it was left alone. Change it there.` });
    return;
  }
  const name = lines[0].distributor_name;
  let supplier = await findSupplier(name);
  if (!supplier && opts.createMissing) {
    const c = await efetch<{ data?: { name: string } }>("/api/resource/Supplier", { method: "POST", json: { supplier_name: name, supplier_group: "All Supplier Groups", supplier_type: "Company" } });
    supplier = c.data?.name ?? null;
  }
  if (!supplier) {
    await setRows(lines.map((l) => l.rec_id), reference, "needs_yes", { missing: { vendor: name }, detail: `Supplier "${name}" is not in ERPNext.` });
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const items: { name?: string; item_code: string; qty: number; rate: number; schedule_date: string }[] = [];
  const ok: number[] = [];
  for (const l of lines) {
    let it = await findItem(l);
    if (!it && opts.createMissing) {
      const c = await efetch<{ data?: { name: string } }>("/api/resource/Item", { method: "POST", json: { item_code: l.sku_id, item_name: l.sku_name, item_group: "All Item Groups", stock_uom: "Nos", is_stock_item: 1, standard_rate: 0, gst_hsn_code: process.env.ERPNEXT_DEFAULT_HSN || "21069099" } });
      if (c.data?.name) it = { code: c.data.name, rate: 0 };
    }
    if (!it) { await setRows([l.rec_id], reference, "needs_yes", { missing: { item: `${l.sku_id} ${l.sku_name}` }, detail: `Item "${l.sku_name}" (${l.sku_id}) is not in ERPNext.` }); continue; }
    items.push({ name: po?.items.find((x) => x.item_code === it!.code)?.name, item_code: it.code, qty: l.qty, rate: it.rate, schedule_date: due });
    ok.push(l.rec_id);
  }
  if (items.length === 0) return;
  const body = { supplier, company: await company(), title: reference, transaction_date: today, schedule_date: due, items, remarks: "Draft from Demand Desk. Please review before submitting." };
  const saved = po
    ? await efetch<{ data?: { name: string } }>(`${PO}/${encodeURIComponent(po.name)}`, { method: "PUT", json: body })
    : await efetch<{ data?: { name: string } }>(PO, { method: "POST", json: body });
  await setRows(ok, reference, "draft", { po_name: saved.data?.name ?? po?.name ?? null });
}

const REC = "SELECT COALESCE(r.order_run_id, r.run_id)::text AS ref, s.distributor_id AS dist FROM recommendations r JOIN skus s ON s.sku_id=r.sku_id WHERE r.id=$1";

/** Marks a rec as waiting, so the Orders page shows "Sending to ERPNext" at once. */
export async function markPending(recId: number) {
  if (!erpReady()) return;
  const r = await query<{ ref: string; dist: string }>(REC, [recId]);
  if (r[0]) await setRows([recId], poReference(Number(r[0].ref), r[0].dist), "pending");
}

/** Called in the background after any decision. */
export async function syncForRec(recId: number, opts: { createMissing?: boolean } = {}) {
  if (!erpReady()) return;
  const r = await query<{ ref: string; dist: string }>(REC, [recId]);
  if (r[0]) await reconcile(Number(r[0].ref), r[0].dist, opts);
}

/** Every (run, distributor) with approved lines or an existing draft. Used by the manual button and after each run. */
export async function reconcileOpen(opts: { createMissing?: boolean } = {}) {
  if (!erpReady()) return;
  const refs = await query<{ ref: string; dist: string }>(
    `SELECT DISTINCT COALESCE(r.order_run_id, r.run_id)::text AS ref, s.distributor_id AS dist FROM recommendations r JOIN skus s ON s.sku_id=r.sku_id
     WHERE r.run_id=(SELECT max(id) FROM runs WHERE status='ok') AND r.decision_status IN ('Approved','Edited') AND r.final_qty > 0`);
  const seen = new Set(refs.map((x) => poReference(Number(x.ref), x.dist)));
  const existing = await query<{ reference: string }>("SELECT DISTINCT reference FROM erp_sync WHERE status='draft'");
  const all = refs.map((x) => ({ orderRun: Number(x.ref), distributorId: x.dist }));
  for (const e of existing) { const p = parseReference(e.reference); if (p && !seen.has(e.reference)) all.push(p); }
  for (const t of all) await reconcile(t.orderRun, t.distributorId, opts);
}
