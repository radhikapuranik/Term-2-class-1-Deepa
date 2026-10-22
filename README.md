# Demand Desk, by Freshroots

Twice-weekly reorder recommendations for Freshroots (MESA Term 2, Case 1, Option A: Demand Planning). It recommends; it never orders. Rules are tested code. Gemini Flash only explains exceptions.

Live: https://demand-desk-mu.vercel.app

## Run it locally
```bash
npm install
cp .env.example .env.local      # then fill the values below
npm run migrate                 # creates the tables (safe to repeat)
npm run seed                    # loads data/seed/*.csv and makes the first run
npm run dev                     # http://localhost:3000
npm test                        # tests, includes the golden table, and the kill switch
```

## Access: no login
This is a demo site. Anyone with the link can use every page. Actions ask for a display name (saved in the browser, shown in the decision log). Guardrails: write actions are rate-limited per IP, Run now has a 5-minute cooldown,  `CRON_SECRET` and `INGEST_TOKEN` are machine-only tokens.

## Environment variables (names only; values live in `.env.local` and Vercel)
| Name | What it is |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini key and the Flash model name (currently `gemini-3.8-flash`) |
| `DIGEST_TO_EMAIL` | Who gets the Monday and Thursday alert (sent through Zoho Mail) |
| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` | One Zoho Self Client on the India data centre (Zoho Mail only) |
| `ZOHO_REFRESH_TOKEN` | Made from the one-time grant code (`ZOHO_GRANT_CODE`, which is deleted after use) |
| `ZOHO_DC` | `in` (accounts.zoho.in, zohoapis.in, mail.zoho.in) |
| `CRON_SECRET`, `INGEST_TOKEN` | Machine tokens for the scheduler and for IT's SAP push |
| `APP_URL`, `SIMULATE_FAIL` | Public address; test-only failure switch (`gemini`, `email`) |

Zoho scopes: `ZohoMail.messages.CREATE,ZohoMail.accounts.READ`. If Zoho says a permission is missing, the app shows the scope string to use.

## Approve and Disapprove
Each row has Approve (green tick) and Disapprove (red cross, reason required); Edit quantity and Defer are smaller actions. Keys: J/K move, A approve, X disapprove, E edit, D defer, U undo (8 seconds). Only Approved lines (and Edited ones, which are approvals with a changed quantity) reach the Order sheet. Override rate = (disapproved + edited) / decided.

## Kill switch
Impact page, "Kill switch": asks for a reason, then stops the scheduled run, Run now, data pushes, Gemini calls, alerts and with a clear message each. A red banner and a header chip show the state. Past data stays readable; decisions can still be recorded. "Switch back on" asks for confirmation. Every kill and revive is logged on the Runs page. It is never pressed automatically; kill-criteria tiles only say "Consider switching off".

## Zoho Mail (alerts only)
The Monday and Thursday alert goes through Zoho Mail (3 tries). If it fails, a message appears under the bell (Alerts page) saying in plain words what to switch on. There is no Zoho Inventory link: the Order sheet (Orders page) is downloaded as CSV or printed, and a person places the orders.

## How to add data
- **By hand:** Data page, choose any of the 5 CSVs, press *Check files*, then *Save and run analysis*. A bad file is refused whole; nothing is half-saved.
- **Automatically:** IT schedules the SAP export and pushes the files:
  `curl -X POST $APP_URL/api/ingest -H "Authorization: Bearer $INGEST_TOKEN" -F sales=@weekly_sales.csv -F inventory=@current_inventory.csv`
  There is **no live SAP API**; SAP exports files and this endpoint receives them.

## Schedule
`vercel.json` runs `/api/cron/analyze` Monday and Thursday 08:00 IST (`30 2 * * 1,4` UTC), production only. On the Hobby plan Vercel may fire anywhere inside that hour. A second call within 6 hours is skipped. *Run now* (Runs and Today pages) has a 5-minute cooldown.

## Structure
- `lib/rules/` the rule engine (pure functions) and settings. `lib/gemini.ts` explanation + validator. `lib/pipeline.ts` the run. `lib/importer.ts` CSV intake.
- `db/schema.sql` idempotent schema. `app/` pages and API routes. `tests/` vitest.

## Zoho notes
The Self Client token is exchanged once from a short-lived grant code. If the refresh token is ever lost, make a new code at api-console.zoho.in (Self Client) with the scopes above and exchange it again.
