# C-08 Live Supabase Verification Evidence (2026-02-28)

Issue: [#60](https://github.com/sicxz/program-command/issues/60)  
Scope: Capture live verification evidence for save safety and RLS behavior after C-06/C-07.

## Environment
- Project ref: `ohnrhjxcjkrdtudpzjgn`
- Verification date (UTC): `2026-02-28`
- Operator: repository maintainer via terminal session

## Commands Executed
1. `npm run check:rls`
2. Direct SQL verification with `psql` against Supabase pooler endpoint to validate policy state and anon-role denial behavior.

## Smoke Check Result
See raw transcript: [docs/examples/supabase-rls-smoke-check-2026-02-28.txt](./examples/supabase-rls-smoke-check-2026-02-28.txt)

Result:
- `PASS resolve target department`
- `PASS anon insert denied`
- `PASS authorized insert allowed`
- `PASS anon update denied`
- `PASS authorized update allowed`
- `PASS anon delete denied`
- `PASS authorized delete allowed`
- Final status: `Result: PASS`

## Policy Verification Notes
During verification, a legacy broad policy was detected in live DB:
- `academic_years | Public write | ALL | {public}`

This was removed, and hardened authenticated-only write policies were validated.

Final `academic_years` policy state:
- `Public read` (`SELECT` to `public`)
- `auth_insert_academic_years` (`INSERT` to `authenticated`)
- `auth_update_academic_years` (`UPDATE` to `authenticated`)

Anon role insert verification (SQL):
- `ERROR: new row violates row-level security policy for table "academic_years"`

## Save-Safety / RLS Outcome
- RLS behavior is now aligned with C-06 intent and C-07 smoke-check expectations.
- Live verification evidence captured for C-08 acceptance.
- Credentials used during session were rotated after completion.
