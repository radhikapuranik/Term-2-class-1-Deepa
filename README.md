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
npm test                        # 61 tests, includes the golden table
```

## Environment variables (names only, values live in `.env.local` and Vercel)
| Name | What it is |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini key and the Flash model name (currently `gemini-3.8-flash`) |
| `RESEND_API_KEY`, `DIGEST_TO_EMAIL` | Digest email. Resend's free plan only delivers to the address you signed up with |
| `CRON_SECRET` | Bearer token the scheduler must send to `/api/cron/analyze` |
| `INGEST_TOKEN` | Bearer token IT sends to `POST /api/ingest` |
| `DESK_PASSCODE`, `SESSION_SECRET` | Passcode for every action; secret that signs the session cookie |
| `APP_URL` | Public address, used in the email link |
| `SIMULATE_FAIL` | Test only: `gemini`, `email` or `gemini,email` makes those steps fail on purpose |

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

## Next step, not built: Zoho Inventory
Approved lines are exported as an order-sheet CSV for a person to enter in Zoho Inventory. To automate: register a Zoho OAuth client, store a refresh token as an env var, and add a server action that creates one purchase order per distributor from `lib/orders.ts`, still behind a human "Send" click.
