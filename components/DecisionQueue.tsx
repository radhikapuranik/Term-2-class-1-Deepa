"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { decide, undo } from "@/app/workflow";
import { OVERRIDE_REASONS } from "@/lib/decisions-shared";
import { CoverBar, StatusBadges, actionText, reasonLine } from "./ui";
import type { DecisionStatus, Rec } from "@/lib/queries";

type Local = { status: DecisionStatus; finalQty: number | null; decisionId?: number };
type Panel = "edit" | "override" | null;

export function DecisionQueue({ recs, signedIn, keyboard = false, variant = "table", actionsOnly = false }: { recs: Rec[]; signedIn: boolean; keyboard?: boolean; variant?: "table" | "cards"; actionsOnly?: boolean }) {
  const [local, setLocal] = useState<Record<number, Local>>({});
  const [active, setActive] = useState(0);
  const [panel, setPanel] = useState<Panel>(null);
  const [toast, setToast] = useState<{ text: string; decisionId: number; recId: number; prev: Local | undefined } | null>(null);
  const [error, setError] = useState("");
  const [, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRef = useRef<typeof toast>(null);
  useEffect(() => { lastRef.current = toast; }, [toast]);

  const view = (r: Rec): Local => (r.id != null && local[r.id]) || { status: r.decision_status, finalQty: r.final_qty };
  const cur = recs[active];

  const act = useCallback((r: Rec, input: Parameters<typeof decide>[1], label: string) => {
    if (r.id == null || !signedIn) return;
    const prev = local[r.id];
    const optimistic: Local = {
      status: input.kind === "approve" ? "Approved" : input.kind === "edit" ? "Edited" : input.kind === "override" ? "Overridden" : "Deferred",
      finalQty: input.kind === "approve" ? r.qty : input.kind === "edit" ? input.qty : input.kind === "override" ? 0 : null,
    };
    setLocal((l) => ({ ...l, [r.id!]: optimistic }));
    setPanel(null); setError("");
    start(async () => {
      const res = await decide(r.id!, input);
      if (!res.ok) {
        setLocal((l) => { const n = { ...l }; if (prev) n[r.id!] = prev; else delete n[r.id!]; return n; });
        setError(res.error);
        return;
      }
      setLocal((l) => ({ ...l, [r.id!]: { status: res.status, finalQty: res.finalQty, decisionId: res.decisionId } }));
      if (timer.current) clearTimeout(timer.current);
      setToast({ text: `${label}: ${r.sku_name.replace("Freshroots ", "")}`, decisionId: res.decisionId, recId: r.id!, prev });
      timer.current = setTimeout(() => setToast(null), 8000);
    });
  }, [local, signedIn]);

  const doUndo = useCallback(() => {
    const t = lastRef.current;
    if (!t) return;
    setToast(null);
    start(async () => {
      const res = await undo(t.decisionId);
      if (res.ok) setLocal((l) => ({ ...l, [t.recId]: { status: res.status ?? "Recommended", finalQty: res.finalQty ?? null } }));
      else setError(res.error ?? "Could not undo.");
    });
  }, []);

  useEffect(() => {
    if (!keyboard || !signedIn) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(el.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === "j") { setActive((a) => Math.min(recs.length - 1, a + 1)); setPanel(null); }
      else if (k === "k") { setActive((a) => Math.max(0, a - 1)); setPanel(null); }
      else if (k === "u") doUndo();
      else if (cur && k === "a") act(cur, { kind: "approve" }, "Approved");
      else if (cur && k === "d") act(cur, { kind: "defer" }, "Deferred");
      else if (cur && k === "e") { e.preventDefault(); setPanel("edit"); }
      else if (cur && k === "o") { e.preventDefault(); setPanel("override"); }
      else if (k === "escape") setPanel(null);
      else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboard, signedIn, recs.length, cur, act, doUndo]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <div>
      {keyboard && signedIn && <p className="small muted no-print"><kbd>J</kbd>/<kbd>K</kbd> move · <kbd>A</kbd> approve · <kbd>E</kbd> edit · <kbd>O</kbd> override · <kbd>D</kbd> defer · <kbd>U</kbd> undo</p>}
      {!signedIn && <p className="banner small"><Link href="/login">Sign in with the passcode</Link> to approve, edit, override or defer.</p>}
      {error && <div className="banner bad" role="alert">{error}</div>}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
        {recs.map((r, i) => {
          const v = view(r);
          const isActive = i === active && keyboard;
          return (
            <li key={r.sku_id} className="card" style={{ padding: 14, boxShadow: isActive ? "inset 0 0 0 2px var(--brand)" : undefined }} onClick={() => keyboard && setActive(i)} aria-current={isActive || undefined}>
              {!actionsOnly && <div style={{ display: "grid", gap: 12, gridTemplateColumns: variant === "cards" ? "1fr" : "minmax(160px,1.2fr) minmax(150px,1fr) minmax(190px,1.4fr)" }} className="qrow">
                <div>
                  <Link className="sku-link" href={`/sku/${r.sku_id}`}>{r.sku_name.replace("Freshroots ", "")}</Link>
                  <span className="sku-code">{r.sku_id}</span>
                  <div style={{ marginTop: 6 }}><StatusBadges r={r} /></div>
                </div>
                <div><CoverBar cover={r.cover} after={r.coverAfter} min={r.minWeeks} max={r.maxWeeks} large={variant === "cards"} /></div>
                <div>
                  <b>{v.status === "Edited" || v.status === "Approved" ? `${r.action === "pause" ? "Pause next order" : `Order ${v.finalQty ?? 0}`}` : actionText(r)}</b>{" "}
                  {v.status !== "Recommended" && <span className="badge b-decision" aria-live="polite">{v.status}</span>}
                  <div className="small muted">{reasonLine(r)}</div>
                  {variant === "cards" && r.exceptions.length > 0 && <ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18 }}>{r.exceptions.map((e, j) => <li key={j}>{e.message}</li>)}</ul>}
                </div>
              </div>}
              {variant === "cards" && !actionsOnly && (
                <div style={{ marginTop: 12 }}>
                  {r.ai_explanation ? (
                    <div style={{ borderLeft: "3px solid var(--brand)", paddingLeft: 12 }}>
                      <p style={{ margin: "0 0 6px" }}>{r.ai_explanation.plain_explanation}</p>
                      <p style={{ margin: "0 0 6px" }}><b>Question:</b> {r.ai_explanation.question_for_planner}</p>
                      <p className="muted" style={{ margin: 0 }}><b>Watch out:</b> {r.ai_explanation.watch_out}</p>
                      <p className="small muted" style={{ margin: "6px 0 0" }}>Written by Gemini. Numbers come from the rule engine.</p>
                    </div>
                  ) : <p className="small muted" style={{ margin: 0 }}>{r.ai_status === "fallback" ? "AI explanation unavailable. Showing the rule engine's own wording above." : "No AI explanation yet."}</p>}
                </div>
              )}
              {signedIn && r.id != null && (
                <ActionBar r={r} v={v} panelOpen={i === active ? panel : null}
                  setPanel={(p) => { setActive(i); setPanel(p); }} act={act} />
              )}
            </li>
          );
        })}
      </ul>
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <span>{toast.text}</span><button onClick={doUndo}>Undo</button>
        </div>
      )}
    </div>
  );
}

function ActionBar({ r, v, panelOpen, setPanel, act }: {
  r: Rec; v: Local; panelOpen: Panel; setPanel: (p: Panel) => void; act: (r: Rec, i: Parameters<typeof decide>[1], label: string) => void;
}) {
  const [qty, setQty] = useState(String(r.final_qty ?? r.qty ?? r.advisoryTopUp ?? 0));
  const [reason, setReason] = useState("");
  const [code, setCode] = useState<string>(OVERRIDE_REASONS[0]);
  const noQty = r.action === "review";
  return (
    <div style={{ marginTop: 12 }} className="no-print">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="group" aria-label={`Decide for ${r.sku_id}`}>
        <button className="btn sm primary" disabled={noQty} title={noQty ? "No automatic quantity: edit or override" : ""} onClick={() => act(r, { kind: "approve" }, "Approved")}>Approve</button>
        <button className="btn sm" onClick={() => setPanel(panelOpen === "edit" ? null : "edit")} aria-expanded={panelOpen === "edit"}>Edit qty</button>
        <button className="btn sm" onClick={() => setPanel(panelOpen === "override" ? null : "override")} aria-expanded={panelOpen === "override"}>Override</button>
        <button className="btn sm" onClick={() => act(r, { kind: "defer" }, "Deferred")}>Defer</button>
        {v.status !== "Recommended" && <span className="small muted" style={{ alignSelf: "center" }}>Current: {v.status}</span>}
      </div>
      {panelOpen === "edit" && (
        <form style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); act(r, { kind: "edit", qty: Number(qty), reason }, "Edited"); }}>
          <div><label htmlFor={`q-${r.sku_id}`}>Quantity ({r.unit_of_measure.toLowerCase()})</label><input id={`q-${r.sku_id}`} type="number" min={0} step={1} value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 120 }} autoFocus /></div>
          <div><label htmlFor={`r-${r.sku_id}`}>Reason</label><input id={`r-${r.sku_id}`} value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: 260 }} placeholder="Why this quantity?" required /></div>
          <button className="btn sm primary">Save edit</button>
          {r.advisoryTopUp != null && <span className="small muted">Advisory top-up: +{r.advisoryTopUp} units to reach the minimum.</span>}
        </form>
      )}
      {panelOpen === "override" && (
        <form style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); act(r, { kind: "override", reasonCode: code, reasonText: reason }, "Overridden"); }}>
          <div><label htmlFor={`c-${r.sku_id}`}>Reason</label><select id={`c-${r.sku_id}`} value={code} onChange={(e) => setCode(e.target.value)} autoFocus>{OVERRIDE_REASONS.map((o) => <option key={o}>{o}</option>)}</select></div>
          <div><label htmlFor={`o-${r.sku_id}`}>Details (optional)</label><input id={`o-${r.sku_id}`} value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: 260 }} /></div>
          <button className="btn sm danger">Override: do not order</button>
        </form>
      )}
    </div>
  );
}
