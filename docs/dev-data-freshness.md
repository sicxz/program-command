# Dev Data Freshness Check

Use this when you need to verify whether dev data has drifted from production before merging or deploying.

## What it checks

For a department and academic year, the checker compares these tables between production and dev:

- `academic_years`
- `rooms`
- `courses`
- `faculty`
- `scheduling_constraints`
- `scheduled_courses`
- `release_time`

For each table it reports:

- row count
- latest change timestamp (`updated_at` or `created_at`)
- freshness status (`in-sync`, `prod-newer`, `dev-newer`, `prod-has-more`, `dev-has-more`, etc.)

## Run (live compare)

```bash
PROD_SUPABASE_URL="https://<prod-ref>.supabase.co" \
PROD_SUPABASE_KEY="<prod-key>" \
DEV_SUPABASE_URL="https://<dev-ref>.supabase.co" \
DEV_SUPABASE_KEY="<dev-key>" \
npm run check:data-freshness -- --department DESN --year 2026-27 --output output/data-freshness-report.json
```

Notes:

- `--department` defaults to `DESN`.
- `--year` is optional. If omitted, the checker uses each environment's active year.
- Exit code is `2` when drift is detected.

## Run (offline compare from saved snapshots)

```bash
npm run check:data-freshness -- \
  --prod-snapshot output/prod-snapshot.json \
  --dev-snapshot output/dev-snapshot.json
```

## Interpreting results

- `in-sync`: no action needed for that table.
- `prod-newer` or `prod-has-more`: production changed after dev snapshot; carry-over likely needed.
- `dev-newer` or `dev-has-more`: dev contains changes not yet in production.

If drift is reported, review the affected tables and plan a carry-over before merge/deploy.
