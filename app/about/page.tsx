import { DEFAULT_SETTINGS as S } from "@/lib/rules/types";

export const metadata = { title: "About" };

export default function Page() {
  return (
    <article style={{ maxWidth: "74ch" }}>
      <h1 style={{ font: "700 2.2rem var(--f-display)" }}>How Demand Desk works</h1>
      <div className="banner demo" role="note" style={{ marginTop: 12 }}><b>Demo site: no login. Anyone with the link can act.</b></div>
      <p className="muted" style={{ marginTop: 10 }}>Demand Desk turns the planner&apos;s written rules into code, refreshes the analysis twice a week from SAP exports, and shows one recommendation per SKU with the full reasoning. It recommends. It never places an order.</p>

      <h2 style={{ margin: "28px 0 8px" }}>The flow</h2>
      <ol>
        <li><b>Data in.</b> IT&apos;s SAP export is uploaded on the Data page or pushed to the ingest address. There is no live SAP connection.</li>
        <li><b>Rules run (code).</b> Every number and flag comes from tested functions, not from AI.</li>
        <li><b>Gemini explains (words only).</b> For the exceptions, it writes a plain explanation and a question. Its output is checked: no new numbers, no links, no other SKUs.</li>
        <li><b>Raghav decides.</b> Approve, disapprove (with a reason), edit the quantity, or defer. Each choice is logged with a name, time and reason.</li>
        <li><b>Order sheet.</b> Approved lines are grouped by distributor and can be sent to Zoho Inventory as draft purchase orders. A person confirms them in Zoho.</li>
      </ol>

      <h2 style={{ margin: "28px 0 8px" }}>The rules (editable on the Rules page)</h2>
      <ul>
        <li><b>Weeks of cover</b> = stock on hand ÷ weekly demand. Weekly demand = the 12-week average, times {1 + S.festivalUpliftPct / 100} in festival months (Mar, Oct, Nov). The uplift is applied before any check.</li>
        <li>Normal SKUs: stockout below {S.stockoutWeeksNormal} weeks, overstock above {S.overstockWeeksNormal}. Perishable SKUs: {S.stockoutWeeksPerishable} to {S.overstockWeeksPerishable} weeks.</li>
        <li><b>High demand</b>: the last 4 weeks beat the 12-week average by more than {Math.round((S.highDemandRatio - 1) * 100)}%.</li>
        <li>Stockout risk: reorder the standard quantity. High demand: {S.highDemandMultiplier}× the standard quantity (and urgent if also stockout). Overstock: pause the next order. High demand with overstock: no automatic quantity, the planner decides.</li>
        <li>If stock is still below the minimum after the order, it is flagged with an advisory extra quantity that is never applied automatically.</li>
        <li>Anything within {S.borderlineMargin * 100}% of a limit is tagged <b>Borderline</b>.</li>
      </ul>

      <h2 style={{ margin: "28px 0 8px" }}>The five pre-build decisions</h2>
      <ol>
        <li><b>Outcome.</b> Cut demand-planning losses by about 25% (proposed) in 90 days, move from monthly to twice-weekly, and cut the planner&apos;s data work from about 2 days to about 2 hours (proposed).</li>
        <li><b>Baseline.</b> Monthly cycle, 3 to 4 week old data, about 2 days of work, Rs 28 to 34 lakh a quarter lost, rules cover 80 to 85% of recommendations. Forecast accuracy and incident counts are unknown and must be back-tested.</li>
        <li><b>Workflow change.</b> The planner moves from building numbers to reviewing flagged SKUs; procurement acts on a twice-weekly list; IT schedules the SAP export; a human enters approved orders into Zoho Inventory.</li>
        <li><b>Measurement plan.</b> Check at day 30, 60 and 90: stockout and overstock counts, forecast accuracy, acceptance and override rates, data freshness, planner hours. Compare festival months with the same months last year or matched SKUs.</li>
        <li><b>Kill criteria (proposed).</b> Overrides above 40% for 4 weeks in a row; back-test no better than the planner&apos;s history; the SAP export not reliable by about day 30; the Rs 15 lakh cap reached with no measurable drop in losses by day 90.</li>
      </ol>

      <h2 style={{ margin: "28px 0 8px" }}>Assumptions and limits</h2>
      <ul>
        <li>The seed is a sample: 15 SKUs and 4 distributors, shown as demo data. The real business has about 400 SKUs and 1,200 distributors.</li>
        <li>There are no prices in the data, so no rupee values are shown except the baseline from the case brief.</li>
        <li>No live SAP link: files in. Zoho gets draft purchase orders only, never confirmed ones. A kill switch on the Impact page stops everything.</li>
        <li>The 12-week baseline defaults to the last 12 weeks including the last 4. The other reading (the 12 weeks before the last 4) is a setting.</li>
        <li>The stale-data panel is a simple back-test on sample data, not a forecast accuracy claim.</li>
      </ul>
    </article>
  );
}
