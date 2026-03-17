# Supabase Policy Smoke Check (Tree/C-07)

## Purpose

Quickly verify RLS behavior after C-06 migration:

- anonymous writes are denied
- authorized writes are allowed
- output is explicit pass/fail

## Command

From repo root:

```bash
npm run check:rls
```

This runs:

- `node scripts/supabase-policy-smoke-check.js`

## Required Environment Variables

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_AUTH_KEY` or `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `SUPABASE_DEPARTMENT_CODE` (defaults to `DESN`)

## Example

```bash
SUPABASE_URL="https://<project-ref>.supabase.co" \
SUPABASE_ANON_KEY="<anon-key>" \
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
npm run check:rls
```

## Behavior

The smoke check uses `academic_years` for a temporary probe row and runs:

1. anon insert (expect denied)
2. authorized insert (expect allowed)
3. anon update/delete against probe row (expect denied)
4. authorized update/delete (expect allowed)

The script attempts cleanup even if a later check fails.

## Exit Codes

- `0`: all checks passed
- `1`: one or more checks failed (or required env vars missing)

## Notes

- Run this against a non-production environment first.
- C-08 captures and stores live verification evidence after this check passes.
- Example completed evidence artifact: `docs/supabase-live-verification-c08-2026-02-28.md`.
