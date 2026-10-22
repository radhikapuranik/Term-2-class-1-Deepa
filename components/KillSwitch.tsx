"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { killSwitch, switchBackOn } from "@/app/impact/actions";
import { getName } from "@/lib/client-name";

export function KillSwitch({ off, reason, when }: { off: boolean; reason?: string; when?: string }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const go = (fn: (n: string) => Promise<{ ok: boolean; message: string }>) => start(async () => {
    const n = getName(); if (!n) return;
    const r = await fn(n); setMsg(r.message); if (r.ok) { setText(""); router.refresh(); }
  });
  return (
    <section id="kill-switch" className="card" style={{ marginTop: 16, borderColor: off ? "var(--stockout)" : undefined }} aria-labelledby="ks">
      <h2 id="ks">Kill switch</h2>
      <p className="muted small" style={{ maxWidth: "64ch" }}>Stops the scheduled run, Run now, data pushes, Gemini calls, and alerts. Past data stays readable and people can still record decisions. It is never pressed automatically.</p>
      {off ? (
        <div>
          <div className="banner bad" role="status">Switched off: {reason}{when ? `, ${when}` : ""}.</div>
          <button className="btn primary" disabled={pending} onClick={() => { if (window.confirm("Switch Demand Desk back on? Scheduled runs, pushes, Gemini and alerts will work again.")) go(switchBackOn); }}>Switch back on</button>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (window.confirm("Switch Demand Desk off? Runs, pushes, Gemini and alerts will stop until someone switches it back on.")) go((n) => killSwitch(text, n)); }} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <div><label htmlFor="kr">Reason (required)</label><input id="kr" value={text} onChange={(e) => setText(e.target.value)} style={{ width: 340 }} placeholder="e.g. Override rate stayed above 40%" required minLength={5} /></div>
          <button className="btn danger" disabled={pending}>■ Switch off</button>
        </form>
      )}
      <div role="status" aria-live="polite" className="small" style={{ marginTop: 8 }}>{msg}</div>
    </section>
  );
}
