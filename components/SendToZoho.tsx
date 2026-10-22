"use client";
import { useState, useTransition } from "react";
import { sendToZoho } from "@/app/orders/zoho";
import { getName } from "@/lib/client-name";
import type { PushReport } from "@/lib/zohoOrders";

export function SendToZoho() {
  const [rep, setRep] = useState<PushReport | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="no-print">
      <button className="btn" disabled={pending} onClick={() => start(async () => { const n = getName(); if (!n) return; setRep(await sendToZoho(n)); })}>{pending ? "Sending drafts…" : "Send to Zoho (draft)"}</button>
      <div aria-live="polite" style={{ marginTop: 12 }}>
        {rep && <div className={`banner ${rep.ok ? "good" : "bad"}`} role="status">{rep.message}</div>}
        {rep?.results.map((r) => <p key={r.reference} className="small" style={{ margin: "4px 0" }}><b className="mono">{r.reference}</b> · {r.distributor_name}: {r.detail}{r.po_number ? ` (PO ${r.po_number})` : ""}</p>)}
        {rep && rep.unmatched.length > 0 && <div className="banner warn" style={{ display: "block" }}><b>Not matched in Zoho (skipped):</b><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{rep.unmatched.map((u, i) => <li key={i}>{u}</li>)}</ul></div>}
      </div>
    </div>
  );
}
