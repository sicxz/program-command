# Supabase Program ID Migration (T-02)

Issue: [#100](https://github.com/sicxz/program-command/issues/100)  
Parent epic: [#98](https://github.com/sicxz/program-command/issues/98)

## Purpose
Execute the first tenantization migration by adding `program_id` to all program-scoped tables and backfilling existing EWU Design data into `programs`.

## Files
- Forward migration: `scripts/supabase-program-id-migration-t02.sql`
- Emergency rollback: `scripts/supabase-program-id-migration-t02-rollback.sql`

## What The Migration Does
1. Creates `public.programs` (if missing).
2. Inserts/updates EWU Design tenant row (`code='ewu-design'`).
3. Adds `program_id` to all scoped tables.
4. Backfills existing rows based on current FK hierarchy.
5. Applies transition default (`program_id = EWU Design`) for backward-compatible inserts.
6. Sets `program_id` to `NOT NULL`.
7. Adds `program_id` FK constraints to `public.programs(id)`.
8. Adds required indexes on every `program_id` column plus high-value query indexes.

## Program-Scoped Tables Updated
- `departments`
- `academic_years`
- `rooms`
- `courses`
- `faculty`
- `scheduled_courses`
- `faculty_preferences`
- `scheduling_constraints`
- `release_time`
- `pathways`
- `pathway_courses`

## Apply (SQL Editor)
Run in Supabase SQL Editor:

```sql
-- copy/paste the full file contents
-- scripts/supabase-program-id-migration-t02.sql
```

Or with `psql`:

```bash
psql "$SUPABASE_DB_URL" -f scripts/supabase-program-id-migration-t02.sql
```

## Verification Queries

### 1) Confirm EWU Design program row exists
```sql
select id, name, code, created_at, updated_at
from public.programs
where code = 'ewu-design';
```

### 2) Confirm every scoped table has non-null `program_id`
```sql
with scoped(table_name) as (
  values
    ('departments'),
    ('academic_years'),
    ('rooms'),
    ('courses'),
    ('faculty'),
    ('scheduled_courses'),
    ('faculty_preferences'),
    ('scheduling_constraints'),
    ('release_time'),
    ('pathways'),
    ('pathway_courses')
)
select
  s.table_name,
  c.is_nullable,
  c.column_default
from scoped s
join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = s.table_name
 and c.column_name = 'program_id'
order by s.table_name;
```

Expected:
- `is_nullable = NO` for all rows.
- `column_default` resolves to EWU Design UUID for transition compatibility.

### 3) Check data backfill completed
```sql
select 'departments' as table_name, count(*) filter (where program_id is null) as null_count from public.departments
union all
select 'academic_years', count(*) filter (where program_id is null) from public.academic_years
union all
select 'rooms', count(*) filter (where program_id is null) from public.rooms
union all
select 'courses', count(*) filter (where program_id is null) from public.courses
union all
select 'faculty', count(*) filter (where program_id is null) from public.faculty
union all
select 'scheduled_courses', count(*) filter (where program_id is null) from public.scheduled_courses
union all
select 'faculty_preferences', count(*) filter (where program_id is null) from public.faculty_preferences
union all
select 'scheduling_constraints', count(*) filter (where program_id is null) from public.scheduling_constraints
union all
select 'release_time', count(*) filter (where program_id is null) from public.release_time
union all
select 'pathways', count(*) filter (where program_id is null) from public.pathways
union all
select 'pathway_courses', count(*) filter (where program_id is null) from public.pathway_courses;
```

Expected: `null_count = 0` for every row.

### 4) Check FK constraints exist
```sql
select
  conrelid::regclass as table_name,
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conname like '%_program_id_fkey'
order by conrelid::regclass::text, conname;
```

## Rollback (Emergency)

```bash
psql "$SUPABASE_DB_URL" -f scripts/supabase-program-id-migration-t02-rollback.sql
```

Rollback removes:
- all `program_id` indexes
- all `<table>_program_id_fkey` constraints
- all `program_id` columns
- `public.programs`

## Notes
- This migration intentionally keeps a temporary EWU Design `program_id` default for backward compatibility while application writes are updated in later T-series tasks.
- After app writes are tenant-aware, remove static defaults and rely on explicit `program_id` plus RLS (`current_program()`) in T-03/T-04.
