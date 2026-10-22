# Progress
## Done
- Phase 1: Next.js project, DB schema (db/schema.sql), seed CSVs in data/seed, rules engine (lib/rules), CSV validator (lib/csv.ts), 44 unit tests passing (golden table, uplift OFF flips, edge cases).
## Doing
- Checkpoint 1: waiting for DATABASE_URL, GEMINI_API_KEY, RESEND_API_KEY, DIGEST_TO_EMAIL.
## Next
- Phase 2: DB wiring (scripts/seed, db client), design system, Today / Recommendations / SKU / Rules pages.
## Open questions / notes
- Borderline: literal "within 10% of a threshold" flags only SKU001 and SKU007 on the seed; the brief's table also marks SKU008, 012, 014. Kept the literal rule (margin is editable on /rules).

## Update (Phase 2 done)
- Keys tested and working. GEMINI_MODEL=gemini-3.8-flash. Neon seeded, run #1+ stored.
- Built: design system, Today, All SKUs (filters, sort, paging, receipt), SKU page (cover bar, chart, receipt), Rules (preview, save with reason, history), login (passcode cookie), 404, loading.
- Next: Phase 3 workflow (approve/edit/override/defer/undo, exceptions, order sheet, Data page, /api/ingest).

## Update (Phase 3 done)
- Workflow: approve/edit/override/defer/undo (+J K A E O D U keys, undo toast), bulk approve, exceptions queue + override patterns + decision log, order sheet + CSV + print, comments, Data page (validate then save, one transaction), POST /api/ingest (token).
- Next: Phase 4 Gemini explanations, digest email, cron + Run now, failure simulation, tests for validator/ingest.
