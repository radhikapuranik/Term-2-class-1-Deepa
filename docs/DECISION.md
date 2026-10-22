# Decision: Option A, Demand Planning

The Nine Checks and the Pre-Build Decision Checklist pointed to Option A (Demand Planning): the rules already exist in the planner's head and spreadsheet, the data is a weekly SAP export, the loss is large (Rs 28 to 34 lakh a quarter), and the planner can stay in control of every decision.

## The five Pre-Build Decisions
1. **Outcome.** Cut demand-planning losses by about 25% (proposed) in 90 days; move from monthly to twice-weekly; cut the planner's data work from about 2 days to about 2 hours (proposed).
2. **Baseline.** Monthly cycle, 3 to 4 week old data, about 2 days of work, Rs 28 to 34 lakh a quarter lost (stockouts Rs 18 to 22 lakh, overstock write-offs Rs 10 to 12 lakh), rules cover 80 to 85% of recommendations. Forecast accuracy and incident counts are unknown and must be back-tested.
3. **Workflow change.** The planner moves from building numbers to reviewing flagged SKUs and approving; procurement acts on a twice-weekly list; IT schedules the SAP export; approved orders go into Zoho Inventory by a human.
4. **Measurement plan.** Check at day 30, 60 and 90: stockout and overstock SKU counts, forecast accuracy, acceptance and override rates, data freshness, planner hours. Festival months (Oct, Nov, Mar) distort comparisons, so compare with the same months last year or matched SKUs. Live on `/impact`.
5. **Kill criteria (proposed).** Overrides above 40% for 4 weeks in a row; back-test shows the rules are no better than the planner's history; the SAP export cannot be made reliable by about day 30; the Rs 15 lakh cap reached with no measurable drop in losses by day 90.

## What is and is not measured by the app
Measured live: override rate by week, acceptance rate, time to decision, data freshness, import reliability, and a simple stale-data back-test. Not measurable from the sample data: planner hours, rupee losses, and the rules-versus-history back-test (needs the planner's past forecasts).
