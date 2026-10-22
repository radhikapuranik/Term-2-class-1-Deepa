"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CoverBar, StatusBadges, actionText, reasonLine, Term, GLOSSARY } from "./ui";
import { n1 } from "@/lib/format";
import type { Rec } from "@/lib/queries";
import type { TraceLine } from "@/lib/rules/types";
import { Receipt } from "./Receipt";

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
      {rows.length === 0 ? <div className="empty">No SKUs match these filters. <button className="btn sm" onClick={() => { setQ(""); setStatus(""); setDist(""); setCat(""); setPeri(""); }}>Clear filters</button></div> : (
        <table className="tbl stack">
          <caption>{rows.length} of {recs.length} SKUs. <Term tip={GLOSSARY.cover}>Weeks of cover</Term>: ▮ today, ◯ after the recommended order.{readOnly && " (Preview, read only.)"}</caption>
          <thead><tr>{th("sku", "SKU")}<th>Status</th>{th("cover", "Cover")}<th>Distributor</th>{th("qty", "Recommendation")}<th><span className="sr">Details</span></th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <FragmentRow key={r.sku_id} r={r} open={open === r.sku_id} onToggle={() => toggle(r)} trace={trace[r.sku_id]} />
            ))}
          </tbody>
        </table>
      )}
      <div className="pager"><button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>← Prev</button><span className="small muted">Page {page + 1} of {pages}</span><button className="btn sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next →</button></div>
    </>
  );
}

function FragmentRow({ r, open, onToggle, trace }: { r: Rec; open: boolean; onToggle: () => void; trace?: TraceLine[] }) {
  return (
    <>
      <tr>
        <td data-label="SKU"><Link className="sku-link" href={`/sku/${r.sku_id}`}>{r.sku_name.replace("Freshroots ", "")}</Link><span className="sku-code">{r.sku_id} · {r.category}{r.perishable ? " · perishable" : ""}</span></td>
        <td data-label="Status"><StatusBadges r={r} /></td>
        <td data-label="Cover" style={{ minWidth: 160 }}><CoverBar cover={r.cover} after={r.coverAfter} min={r.minWeeks} max={r.maxWeeks} /><span className="small muted mono">{n1(r.cover)} wks</span></td>
        <td data-label="Distributor" className="mono small">{r.distributor_id}</td>
        <td data-label="Recommendation"><b>{actionText(r)}</b>{r.decision_status !== "Recommended" && <> <span className="badge b-decision">{r.decision_status}</span></>}<div className="small muted">{reasonLine(r)}</div></td>
        <td data-label=""><button className="btn sm" aria-expanded={open} onClick={onToggle}>{open ? "Hide receipt" : "Rule receipt"}</button></td>
      </tr>
      {open && (
        <tr><td colSpan={6} className="full">{trace ? <Receipt skuId={r.sku_id} name={r.sku_name} trace={trace} /> : <span className="muted small">Loading…</span>}</td></tr>
      )}
    </>
  );
}
