# T-03 Program-Scoped RLS

Issue: [#101](https://github.com/sicxz/program-command/issues/101)

## Migration
Run after T-02 and T-04:

- `scripts/supabase-program-id-migration-t02.sql`
- `scripts/supabase-current-program-helper-t04.sql`
- `scripts/supabase-program-rls-t03.sql`

## What it does

- Enables RLS on every program-owned table.
- Replaces existing table policies with program-scoped policies using:
  - `program_id = public.current_program()`
  - platform admin bypass via `public.is_platform_admin()`
- Preserves role behavior:
  - `departments`: admin-only writes
  - all other scoped tables: chair/admin insert-update, admin-only delete

## Scoped Tables

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

## Verification

```sql
-- Confirm RLS is enabled
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'departments','academic_years','rooms','courses','faculty',
    'scheduled_courses','faculty_preferences','scheduling_constraints',
    'release_time','pathways','pathway_courses'
  )
order by tablename;

-- Confirm t03 policies exist
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and policyname like 't03_%'
order by tablename, policyname;
```

Expected:

- 4 policies per scoped table (`SELECT`, `INSERT`, `UPDATE`, `DELETE`)
- no cross-program visibility for non-platform-admin users.
