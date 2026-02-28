# Supabase RLS Hardening Migration (Tree/C-06)

## Purpose

Apply operation-scoped authenticated write policies for core scheduling tables and remove legacy broad `FOR ALL` write policies.

## Migration Script

- `scripts/supabase-rls-hardening.sql`

This migration is idempotent and can be re-run safely.

## What It Changes

- Drops legacy policy name `"Authenticated write"` from scheduling tables.
- Recreates explicit authenticated policies by operation (`INSERT`, `UPDATE`, `DELETE`) per table.
- Leaves `departments` write operations service-role only.
- Keeps anonymous write/delete blocked by not granting any `anon` write policy.

## Target Behavior

- Anonymous users cannot `INSERT`, `UPDATE`, or `DELETE` scheduling rows.
- Authenticated users can write only where operation policies are explicitly defined.
- Service role retains full access for automation/migrations.

## Run Instructions

In Supabase SQL editor (recommended), run:

```sql
-- copy/paste the full contents of scripts/supabase-rls-hardening.sql
```

Or from local tooling:

```bash
psql "$SUPABASE_DB_URL" -f scripts/supabase-rls-hardening.sql
```

## Verification Query

Run after migration to verify active policies:

```sql
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'departments',
    'academic_years',
    'rooms',
    'courses',
    'faculty',
    'scheduled_courses',
    'faculty_preferences',
    'scheduling_constraints',
    'release_time',
    'pathways',
    'pathway_courses'
  )
order by tablename, policyname;
```

Expected:

- No remaining `policyname = 'Authenticated write'`.
- `scheduled_courses` has explicit authenticated `INSERT`, `UPDATE`, and `DELETE` policies.
- No write policy with role `anon`.

## Follow-on

- C-07 adds automated smoke checks for these policy expectations.
- C-08 captures live environment verification evidence.
