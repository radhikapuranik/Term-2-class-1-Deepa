# Submission: Demand Desk, by Freshroots

- **Live URL:** https://demand-desk-mu.vercel.app
- **GitHub:** https://github.com/radhikapuranik/Term-2-class-1-Deepa
- **Passcode:** stored in `demand-desk/.env.local` on the line `DESK_PASSCODE=` (also set on Vercel). Anyone can read the dashboard; every action needs the passcode.
- **How Raghav changes a rule:** Rules page, edit a number, press *Preview what would change* (shows which SKUs flip), type a reason, press *Save rules*. The change is logged with who, when, old value, new value and reason, and applies from the next run.

## 90-second demo script
1. Open **Today**: "7 of 15 SKUs need a decision", the demo-data banner, the festival-uplift note (try *See it without the uplift*).
2. Open **SKU001**: cover bar (3.4 weeks, ghost marker at 6.1 after the order), sales chart, and the **rule receipt** line by line.
3. Sign in, go back to Today. **Approve** SKU001 (press `A`), **Edit** SKU003 (`E`, quantity 450, reason), **Override** SKU011 (`O`, pick a reason). Press `U` to undo one.
4. Open **Orders**: lines grouped by distributor; Download CSV; Print.
5. Open **Impact**: baseline versus now, the three kill-criteria tiles, and the stale-data back-test.

## Known limits
- Sample data only (15 SKUs, 4 distributors); designed for 400 SKUs.
- No live SAP link (files in by upload or `/api/ingest`) and no Zoho link (CSV out).
- No prices in the data, so no rupee values are shown except the baseline from the case brief.
- Free-plan cron timing: the scheduled run may start anywhere inside its 08:00 IST hour. Resend's free plan only emails the signed-up address.
- The stale-data panel is a simple back-test on the sample (4-week average, 4 weeks tested). The rules-versus-history back-test needs Raghav's past forecasts.
- The 12-week baseline defaults to "last 12 weeks including the last 4"; the other reading is a setting.
- "Borderline" is the literal "within 10% of a limit", which flags SKU001 and SKU007 on the seed. The brief's table also marks SKU008, 012 and 014; the margin is editable.
- The order sheet belongs to the latest run: download or enter it before the next run.

## Why are the rules in code and Gemini only explains?
Planning numbers must be the same every time, checkable line by line, and owned by the planner. Code gives exactly that: the rules are tested against the brief's reference table, every threshold is an editable setting with a change history, and each result carries a receipt. A language model can vary between runs and can state a wrong number with confidence, so it is kept away from calculations, flags and quantities. Gemini only turns an already-decided exception into plain words and a question for Raghav, and its text is rejected if it contains any number, link or SKU that was not in the supplied facts, falling back to a plain template if it fails. If Gemini is down, the plan is unchanged.
