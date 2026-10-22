"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CoverBar, StatusBadges, actionText, reasonLine, Term, GLOSSARY } from "./ui";
import { n1 } from "@/lib/format";
import type { Rec } from "@/lib/queries";
import type { TraceLine } from "@/lib/rules/types";
import { Receipt } from "./Receipt";
import { useRouter } from "next/navigation";
import { bulkApprove, bulkDisapprove, decide } from "@/app/workflow";
import { getName } from "@/lib/client-name";
import { OVERRIDE_REASONS } from "@/lib/decisions-shared";

type Key = "sku" | "cover" | "qty" | "urgency";
const PAGE = 25;

export function RecTable({ recs, initialStatus, distributors, readOnly }: { recs: Rec[]; initialStatus?: string; distributors: string[]; readOnly?: boolean }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(initialStatus ?? "");
  const [dist, setDist] = useState("");
  const [cat, setCat] = useState("");
  const [peri, setPeri] = useState("");
  const [sort, setSort] = useState<{ k: Key; dir: 1 | -1 }>({ k: "urgency", dir: 1 });
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState("");
  const router = useRouter();
  const canAct = !readOnly;
  const [bulkReason, setBulkReason] = useState<string>(OVERRIDE_REASONS[0]);
  const approveable = (r: Rec) => r.id != null && r.action !== "review" && r.action !== "none" && (r.decision_status === "Recommended" || r.decision_status === "Deferred");
  const [trace, setTrace] = useState<Record<string, TraceLine[]>>({});
  const cats = useMemo(() => [...new Set(recs.map((r) => r.category))].sort(), [recs]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const f = recs.filter((r) =>
      (!t || r.sku_id.toLowerCase().includes(t) || r.sku_name.toLowerCase().includes(t)) &&
      (!dist || r.distributor_id === dist) && (!cat || r.category === cat) &&
      (!peri || (peri === "high" ? r.perishable : !r.perishable)) &&
      (!status || (status === "high" ? r.highDemand : status === "borderline" ? r.borderline.length > 0 : status === "exception" ? r.exceptions.length > 0 : r.status === status)));
    const rank = (r: Rec) => (r.urgent ? 0 : r.action === "review" ? 1 : r.status === "stockout" ? 2 : r.status === "exception" ? 3 : r.action === "pause" ? 4 : 5) * 1000 + (r.cover ?? 999);
    const val = (r: Rec) => sort.k === "sku" ? r.sku_id : sort.k === "cover" ? (r.cover ?? 9999) : sort.k === "qty" ? (r.final_qty ?? r.qty ?? -1) : rank(r);
    return [...f].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [recs, q, status, dist, cat, peri, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const th = (k: Key, label: string) => (
    <th aria-sort={sort.k === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button onClick={() => { setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 })); setPage(0); }}>{label}{sort.k === k ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</button>
    </th>
  );
  async function toggle(r: Rec) {
    const next = open === r.sku_id ? null : r.sku_id;
    setOpen(next);
    if (next && !trace[r.sku_id] && r.id) {
      const res = await fetch(`/api/receipt/${r.id}`);
      if (res.ok) { const j = await res.json(); setTrace((t) => ({ ...t, [r.sku_id]: j.trace })); }
    } else if (next && !r.id) setTrace((t) => ({ ...t, [r.sku_id]: r.trace ?? [] }));
  }
  const reset = (fn: () => void) => { fn(); setPage(0); };

  return (
    <>
      <div className="filters" role="search">
        <div><label htmlFor="q">Search</label><input id="q" value={q} onChange={(e) => reset(() => setQ(e.target.value))} placeholder="SKU or name" /></div>
        <div><label htmlFor="st">Status</label><select id="st" value={status} onChange={(e) => reset(() => setStatus(e.target.value))}>
          <option value="">All</option><option value="stockout">Stockout risk</option><option value="high">High demand</option><option value="overstock">Overstock</option><option value="ok">OK</option><option value="borderline">Borderline</option><option value="exception">Has an exception</option></select></div>
        <div><label htmlFor="ds">Distributor</label><select id="ds" value={dist} onChange={(e) => reset(() => setDist(e.target.value))}><option value="">All</option>{distributors.map((d) => <option key={d}>{d}</option>)}</select></div>
        <div><label htmlFor="ct">Category</label><select id="ct" value={cat} onChange={(e) => reset(() => setCat(e.target.value))}><option value="">All</option>{cats.map((d) => <option key={d}>{d}</option>)}</select></div>
        <div><label htmlFor="pe">Perishable</label><select id="pe" value={peri} onChange={(e) => reset(() => setPeri(e.target.value))}><option value="">All</option><option value="high">Perishable</option><option value="low">Not perishable</option></select></div>
      </div>
      {canAct && (
        <div className="no-print" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <button className="btn sm approve" disabled={picked.size === 0} onClick={async () => {
            const n = getName(); if (!n) return;
            const res = await bulkApprove([...picked], n);
            setMsg(res.ok ? `Approved ${res.done.length}${res.skipped ? `, skipped ${res.skipped}` : ""}.` : res.error);
            setPicked(new Set()); router.refresh();
          }}>✓ Approve selected ({picked.size})</button>
          <select aria-label="Reason for disapproving" value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} style={{ minHeight: 32, padding: "4px 8px" }}>{OVERRIDE_REASONS.map((o) => <option key={o}>{o}</option>)}</select>
          <button className="btn sm disapprove" disabled={picked.size === 0} onClick={async () => {
            const n = getName(); if (!n) return;
            const res = await bulkDisapprove([...picked], bulkReason, "", n);
            setMsg(res.ok ? `Disapproved ${res.done.length}${res.skipped ? `, skipped ${res.skipped}` : ""}.` : res.error);
            setPicked(new Set()); router.refresh();
          }}>✕ Disapprove selected ({picked.size})</button>
          <button className="btn sm" onClick={() => setPicked(new Set(rows.filter(approveable).map((r) => r.id!)))}>Select all with an action</button>
          <span role="status" className="small muted">{msg}</span>
        </div>
      )}
      {rows.length === 0 ? <div className="empty">No SKUs match these filters. <button className="btn sm" onClick={() => { setQ(""); setStatus(""); setDist(""); setCat(""); setPeri(""); }}>Clear filters</button></div> : (
        <table className="tbl stack">
          <caption>{rows.length} of {recs.length} SKUs. <Term tip={GLOSSARY.cover}>Weeks of cover</Term>: ▮ today, ◯ after the recommended order.{readOnly && " (Preview, read only.)"}</caption>
          <thead><tr>{canAct && <th><span className="sr">Select</span></th>}{th("sku", "SKU")}<th>Status</th>{th("cover", "Cover")}<th>Distributor</th>{th("qty", "Recommendation")}<th><span className="sr">Details</span></th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <FragmentRow key={r.sku_id} r={r} open={open === r.sku_id} onToggle={() => toggle(r)} trace={trace[r.sku_id]} canDecide={canAct} select={canAct ? { can: approveable(r), on: r.id != null && picked.has(r.id), flip: () => setPicked((p) => { const n = new Set(p); if (r.id != null) { if (n.has(r.id)) n.delete(r.id); else n.add(r.id); } return n; }) } : undefined} />
            ))}
          </tbody>
        </table>
      )}
      <div className="pager"><button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>← Prev</button><span className="small muted">Page {page + 1} of {pages}</span><button className="btn sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next →</button></div>
    </>
  );
}

function FragmentRow({ r, open, onToggle, trace, select, canDecide }: { canDecide?: boolean; r: Rec; open: boolean; onToggle: () => void; trace?: TraceLine[]; select?: { can: boolean; on: boolean; flip: () => void } }) {
  return (
    <>
      <tr className={select?.on ? "sel" : undefined}>
        {select && <td data-label="Select"><input type="checkbox" checked={select.on} disabled={!select.can} onChange={select.flip} aria-label={`Select ${r.sku_id}`} /></td>}
        <td data-label="SKU"><Link className="sku-link" href={`/sku/${r.sku_id}`}>{r.sku_name.replace("Freshroots ", "")}</Link><span className="sku-code">{r.sku_id} · {r.category}{r.perishable ? " · perishable" : ""}</span></td>
        <td data-label="Status"><StatusBadges r={r} /></td>
        <td data-label="Cover" style={{ minWidth: 160 }}><CoverBar cover={r.cover} after={r.coverAfter} min={r.minWeeks} max={r.maxWeeks} /><span className="small muted mono">{n1(r.cover)} wks</span></td>
        <td data-label="Distributor" className="mono small">{r.distributor_id}</td>
        <td data-label="Recommendation"><b>{actionText(r)}</b>{r.decision_status !== "Recommended" && <> <span className="badge b-decision">{r.decision_status}</span></>}<div className="small muted">{reasonLine(r)}</div>{canDecide && r.id != null && <QuickDecide r={r} />}</td>
        <td data-label=""><button className="btn sm" aria-expanded={open} onClick={onToggle}>{open ? "Hide receipt" : "Rule receipt"}</button></td>
      </tr>
      {open && (
        <tr><td colSpan={7} className="full">{trace ? <Receipt skuId={r.sku_id} name={r.sku_name} trace={trace} /> : <span className="muted small">Loading…</span>}</td></tr>
      )}
    </>
  );
}

function QuickDecide({ r }: { r: Rec }) {
  const router = useRouter();
  const [status, setStatus] = useState<string>(r.decision_status);
  const [ask, setAsk] = useState(false);
  const [code, setCode] = useState<string>(OVERRIDE_REASONS[0]);
  const [err, setErr] = useState("");
  const run = async (input: Parameters<typeof decide>[1], to: string) => {
    const n = getName(); if (!n) return;
    const res = await decide(r.id!, input, n);
    if (res.ok) { setStatus(to); setAsk(false); setErr(""); router.refresh(); } else setErr(res.error);
  };
  return (
    <div style={{ marginTop: 8 }} className="no-print">
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn sm approve" disabled={r.action === "review" || r.action === "none"} onClick={() => run({ kind: "approve" }, "Approved")}>✓ Approve</button>
        <button className="btn sm disapprove" onClick={() => setAsk(!ask)} aria-expanded={ask}>✕ Disapprove</button>
        {status !== "Recommended" && <span className="badge b-decision">{status}</span>}
      </div>
      {ask && (
        <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
          <select aria-label="Reason" value={code} onChange={(e) => setCode(e.target.value)} style={{ minHeight: 32, padding: "4px 8px" }}>{OVERRIDE_REASONS.map((o) => <option key={o}>{o}</option>)}</select>
          <button className="btn sm danger" onClick={() => run({ kind: "disapprove", reasonCode: code }, "Disapproved")}>Confirm</button>
        </div>
      )}
      {err && <div role="alert" className="small" style={{ color: "var(--stockout)" }}>{err}</div>}
    </div>
  );
}
