"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runNow } from "@/app/run-now";

export function RunNow({ signedIn }: { signedIn: boolean }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!signedIn) return <span className="small muted">Sign in to run the analysis now.</span>;
  return (
    <span className="no-print" style={{ display: "inline-flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <button className="btn sm" disabled={pending} onClick={() => start(async () => { setMsg(null); const r = await runNow(); setMsg({ ok: r.ok, text: r.message }); if (r.ok) router.refresh(); })}>
        {pending ? "Running… (about 20 seconds)" : "Run now"}
      </button>
      <span role="status" aria-live="polite" className="small" style={{ color: msg && !msg.ok ? "var(--stockout)" : "var(--muted)" }}>{msg?.text}</span>
    </span>
  );
}
