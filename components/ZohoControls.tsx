"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMissingInZoho, sendToZoho } from "@/app/orders/zoho";
import { getName } from "@/lib/client-name";

export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let n = 0;
    const t = setInterval(() => { router.refresh(); if (++n >= 15) clearInterval(t); }, 4000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}

export function SendToZoho({ missing }: { missing: string[] }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const go = (create: boolean) => start(async () => {
    const n = getName(); if (!n) return;
    const r = await (create ? createMissingInZoho(n) : sendToZoho(n));
    setMsg({ ok: r.ok, text: r.message }); router.refresh();
  });
  return (
    <div className="no-print" style={{ display: "grid", gap: 10 }}>
      <div><button className="btn" disabled={pending} onClick={() => go(false)}>{pending ? "Working…" : "Send to Zoho (draft)"}</button>
        <span className="small muted"> Re-sends all approved lines as DRAFT purchase orders. Nothing is confirmed or sent to a distributor.</span></div>
      {missing.length > 0 && (
        <div className="banner warn" style={{ display: "block" }}>
          <b>Not in Zoho yet:</b>
          <ul style={{ margin: "6px 0", paddingLeft: 18 }}>{missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
          <p style={{ margin: "0 0 8px" }}>Do you want me to create these in Zoho? Items are created with a price of 0, so please fill in the real purchase price in Zoho.</p>
          <button className="btn sm primary" disabled={pending} onClick={() => { if (window.confirm("Yes, create the listed vendors and items in Zoho Inventory?")) go(true); }}>Yes, create them in Zoho</button>
        </div>
      )}
      <div aria-live="polite">{msg && <div className={`banner ${msg.ok ? "good" : "bad"}`} role="status">{msg.text}</div>}</div>
    </div>
  );
}
