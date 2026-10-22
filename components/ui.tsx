import type { ReactNode } from "react";
import type { Rec } from "@/lib/queries";
import { n1 } from "@/lib/format";

const I = {
  stockout: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 15 14H1z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M8 6v4M8 11.6v.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
  high: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 12 6.5 7l3 3L14 4M10 4h4v4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  over: <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="9" width="12" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" /><rect x="4" y="4" width="8" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>,
  ok: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8.5 3.2 3.2L13 4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  exception: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 14V2m0 1h8l-2 3 2 3H4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  borderline: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h12M5 5l-3 3 3 3M11 5l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>,
};

export function Badge({ kind, children }: { kind: keyof typeof I; children: ReactNode }) {
  const cls = { stockout: "b-stockout", high: "b-high", over: "b-over", ok: "b-ok", exception: "b-exception", borderline: "b-borderline" }[kind];
  return <span className={`badge ${cls}`}>{I[kind]}{children}</span>;
}

export function StatusBadges({ r }: { r: Pick<Rec, "status" | "highDemand" | "urgent" | "borderline" | "exceptions"> }) {
  const flagged = r.exceptions.length > 0 && r.status === "exception";
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
      {r.status === "stockout" && <Badge kind="stockout">{r.urgent ? "Urgent stockout" : "Stockout risk"}</Badge>}
      {r.highDemand && <Badge kind="high">High demand</Badge>}
      {r.status === "overstock" && <Badge kind="over">Overstock</Badge>}
      {r.status === "ok" && !r.highDemand && <Badge kind="ok">OK</Badge>}
      {flagged && <Badge kind="exception">Needs judgment</Badge>}
      {r.borderline.length > 0 && <Badge kind="borderline">Borderline</Badge>}
    </span>
  );
}

export function Term({ tip, children }: { tip: string; children: ReactNode }) {
  return <span data-tip={tip} tabIndex={0} aria-label={`${typeof children === "string" ? children : ""}: ${tip}`}>{children}</span>;
}

export const GLOSSARY = {
  cover: "Weeks of cover = how many weeks your stock will last at the usual selling speed.",
  festival: "Festival uplift = extra demand we expect in festival months (Mar, Oct, Nov). It is added before the checks.",
  highDemand: "High demand = the last 4 weeks sold more than 1.2 times the 12-week average.",
  stockout: "Stockout risk = stock will run out before the next order can arrive.",
  overstock: "Overstock = more stock than you need; it may expire or tie up cash.",
  borderline: "Borderline = within 10% of a limit, so worth a second look.",
  exception: "Exception = a case the rules cannot settle alone; the planner decides.",
  avg12: "12-week average = average weekly sales over the baseline window (default: the last 12 weeks).",
} as const;

/** Bullet chart: weeks of cover with the safe zone, today marker and a ghost marker for after the order. */
export function CoverBar({ cover, after, min, max, large }: { cover: number | null; after?: number | null; min: number; max: number; large?: boolean }) {
  if (cover == null) return <span className="muted small">no cover figure</span>;
  const scale = Math.max(max * 1.35, cover * 1.08, (after ?? 0) * 1.08);
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  const showGhost = after != null && Math.abs(after - cover) > 0.04;
  const label = `Cover ${n1(cover)} weeks. Safe range ${min} to ${max} weeks.${showGhost ? ` After the recommended order: ${n1(after)} weeks.` : ""}`;
  return (
    <div>
      <div className={`cover${large ? " lg" : ""}`} role="img" aria-label={label}>
        <div className="track" />
        <div className="zone" style={{ left: pct(min), width: `calc(${pct(max)} - ${pct(min)})` }} />
        {showGhost && <div className="ghost" style={{ left: pct(after!) }} />}
        <div className="now" style={{ left: pct(cover) }} />
      </div>
      {large && (
        <div className="cover-legend">
          <span><b className="mono">▮</b> today {n1(cover)} wks</span>
          {showGhost && <span><b className="mono">◯</b> after order {n1(after)} wks</span>}
          <span style={{ color: "var(--ok)" }}>▒ safe {min} to {max} wks</span>
        </div>
      )}
    </div>
  );
}

export function actionText(r: Pick<Rec, "action" | "qty" | "final_qty" | "decision_status" | "unit_of_measure">) {
  if (r.action === "reorder") return `Reorder ${r.final_qty ?? r.qty}`;
  if (r.action === "pause") return "Pause next order";
  if (r.action === "review") return "Planner to decide";
  return "No action";
}

export function reasonLine(r: Rec): string {
  const c = n1(r.cover);
  if (r.action === "review") return `Demand is rising but cover is ${c} wks (above ${r.maxWeeks}).`;
  if (r.status === "stockout") return `Cover ${c} wks is below the ${r.minWeeks}-wk minimum${r.highDemand ? " and demand is rising" : ""}.`;
  if (r.status === "overstock") return `Cover ${c} wks is above the ${r.maxWeeks}-wk maximum.`;
  if (r.status === "exception") return r.exceptions[0]?.message ?? "Needs the planner.";
  return `Cover ${c} wks is inside ${r.minWeeks} to ${r.maxWeeks}.`;
}

export function Skeleton({ h = 20, w = "100%" }: { h?: number; w?: number | string }) {
  return <div className="skel" style={{ height: h, width: w }} aria-hidden="true" />;
}
