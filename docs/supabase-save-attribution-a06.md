# Supabase Save Attribution Migration (Tree/A-06)

Issue: [#92](https://github.com/sicxz/program-command/issues/92)

## Purpose
Track who changed scheduler data and when on every write.

Migration script:
- `scripts/supabase-save-attribution-a06.sql`

RPC update:
- `scripts/supabase-schedule-sync-rpc.sql`

## Behavior
- Adds `updated_by` (`uuid`, references `auth.users(id)`) and `updated_at` columns across scheduling/system tables.
- Adds trigger `public.set_row_write_audit_fields()` to stamp:
  - `updated_at = now()` on INSERT/UPDATE
  - `updated_by = auth.uid()` when an authenticated user exists
- Keeps existing rows by backfilling `updated_at` where missing.

## Apply
Run both SQL files in Supabase SQL Editor (or `psql`):

```sql
\i scripts/supabase-save-attribution-a06.sql
\i scripts/supabase-schedule-sync-rpc.sql
```

## Verify

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'departments','academic_years','rooms','courses','faculty',
    'scheduled_courses','faculty_preferences','scheduling_constraints',
    'release_time','pathways','pathway_courses'
  )
  and column_name in ('updated_by','updated_at')
order by table_name, column_name;
```

```sql
select tgname, tgrelid::regclass as table_name
from pg_trigger
where tgname like 'trg_write_audit_%'
  and not tgisinternal
order by tgname;
```

Expected:
- All listed tables expose `updated_at` and `updated_by`.
- Write-audit triggers exist for each table.
- New scheduler writes populate `updated_by` and refresh `updated_at`.
