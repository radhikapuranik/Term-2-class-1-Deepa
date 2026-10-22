# Progress
## Done
- Phase 1: Next.js project, DB schema (db/schema.sql), seed CSVs in data/seed, rules engine (lib/rules), CSV validator (lib/csv.ts), 44 unit tests passing (golden table, uplift OFF flips, edge cases).
## Doing
- Checkpoint 1: waiting for DATABASE_URL, GEMINI_API_KEY, RESEND_API_KEY, DIGEST_TO_EMAIL.
## Next
- Phase 2: DB wiring (scripts/seed, db client), design system, Today / Recommendations / SKU / Rules pages.
## Open questions / notes
- Borderline: literal "within 10% of a threshold" flags only SKU001 and SKU007 on the seed; the brief's table also marks SKU008, 012, 014. Kept the literal rule (margin is editable on /rules).
