"use client";
import { useActionState } from "react";
import { rulesAction, type RulesState } from "./actions";
import type { Settings } from "@/lib/rules/types";
import { Term } from "@/components/ui";

const FIELDS: { k: string; label: string; help: string; step?: string; get: (s: Settings) => number }[] = [
  { k: "stockoutWeeksNormal", label: "Stockout below (weeks)", help: "Normal SKUs: below this many weeks of cover means reorder now.", get: (s) => s.stockoutWeeksNormal },
  { k: "overstockWeeksNormal", label: "Overstock above (weeks)", help: "Normal SKUs: above this many weeks of cover means pause the next order.", get: (s) => s.overstockWeeksNormal },
  { k: "stockoutWeeksPerishable", label: "Perishable minimum (weeks)", help: "High-perishability SKUs use this instead of the normal minimum.", get: (s) => s.stockoutWeeksPerishable },
  { k: "overstockWeeksPerishable", label: "Perishable maximum (weeks)", help: "High-perishability SKUs use this instead of the normal maximum.", get: (s) => s.overstockWeeksPerishable },
  { k: "highDemandRatio", label: "High demand ratio (x)", step: "0.05", help: "High demand when the last 4 weeks average beats the 12-week average by this multiple (1.2 = 20% higher).", get: (s) => s.highDemandRatio },
  { k: "highDemandMultiplier", label: "High demand order size (x)", step: "0.1", help: "A high-demand SKU reorders this multiple of its standard quantity.", get: (s) => s.highDemandMultiplier },
  { k: "festivalUpliftPct", label: "Festival uplift (%)", help: "Extra weekly demand assumed in festival months, applied before the cover checks.", get: (s) => s.festivalUpliftPct },
  { k: "borderlinePct", label: "Borderline margin (%)", help: "A figure within this percent of a limit is tagged Borderline.", get: (s) => s.borderlineMargin * 100 },
  { k: "swingPct", label: "Latest-week swing (%)", help: "Flag a SKU when last week is this far from its 4-week average.", get: (s) => s.swingPct * 100 },
  { k: "minHistoryWeeks", label: "Minimum history (weeks)", help: "Fewer weeks than this counts as a new product and goes to exceptions.", get: (s) => s.minHistoryWeeks },
];

export function RulesForm({ settings, signedIn }: { settings: Settings; signedIn: boolean }) {
  const [state, action, pending] = useActionState<RulesState | undefined, FormData>(rulesAction, undefined);
  return (
    <form action={action}>
      <div className="grid">
        {FIELDS.map((f) => (
          <div key={f.k} className="col-6" style={{ gridColumn: "span 6" }}>
            <label htmlFor={f.k}>{f.label}</label>
            <input id={f.k} name={f.k} type="number" step={f.step ?? "any"} required defaultValue={+f.get(settings).toFixed(2)} style={{ width: 140 }} aria-describedby={`${f.k}-h`} />
            <div id={`${f.k}-h`} className="small muted">{f.help}</div>
          </div>
        ))}
        <div className="col-6" style={{ gridColumn: "span 6" }}>
          <label htmlFor="baselineWindow"><Term tip="Which 12 weeks form the baseline. Default: the last 12 weeks including the last 4.">12-week baseline window</Term></label>
          <select id="baselineWindow" name="baselineWindow" defaultValue={settings.baselineWindow}>
            <option value="trailing12">Last 12 weeks, including the last 4 (default)</option>
            <option value="prior12">The 12 weeks before the last 4</option>
          </select>
          <div className="small muted">Active now: {settings.baselineWindow === "trailing12" ? "last 12 weeks including the last 4" : "12 weeks before the last 4"}.</div>
        </div>
      </div>
      <hr className="rule" />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
        <div><label htmlFor="reason">Reason for the change (needed to save)</label><input id="reason" name="reason" style={{ width: 320 }} placeholder="e.g. Diwali week needs more buffer" /></div>
        <button className="btn" name="intent" value="preview" disabled={pending}>Preview what would change</button>
        <button className="btn primary" name="intent" value="save" disabled={pending || !signedIn} title={signedIn ? "" : "Sign in first"}>Save rules</button>
      </div>
      {!signedIn && <p className="small muted" style={{ marginTop: 8 }}>Previewing is open to everyone. Saving needs the desk passcode: use Sign in at the top.</p>}
      <div aria-live="polite" style={{ marginTop: 16 }}>
        {state?.error && <div className="banner bad" role="alert">{state.error}</div>}
        {state?.saved && <div className="banner good">Saved. The new rules apply from the next run.</div>}
        {state?.preview && (state.preview.length === 0 ? <div className="banner">No SKU on the current data would change.</div> : (
          <table className="tbl stack"><caption>{state.preview.length} SKU(s) would change on the current data</caption>
            <thead><tr><th>SKU</th><th>Now</th><th>With these rules</th></tr></thead>
            <tbody>{state.preview.map((p) => <tr key={p.sku_id}><td data-label="SKU">{p.name} <span className="sku-code">{p.sku_id}</span></td><td data-label="Now">{p.before}</td><td data-label="With these rules"><b>{p.after}</b></td></tr>)}</tbody></table>
        ))}
      </div>
    </form>
  );
}
