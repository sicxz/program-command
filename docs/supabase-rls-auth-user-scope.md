# Supabase Role-Scoped RLS Migration (Tree/A-05)

Issue: [#91](https://github.com/sicxz/program-command/issues/91)

## Purpose
Apply role-aware write policies so authenticated requests are scoped by role:
- `admin`: INSERT/UPDATE/DELETE on scheduling and system-config tables
- `chair`: INSERT/UPDATE on scheduling tables
- `anon`: no write access

Migration script:
- `scripts/supabase-rls-auth-user-scope.sql`

## Apply
From Supabase SQL Editor or `psql` against the project database, run:

```sql
\i scripts/supabase-rls-auth-user-scope.sql
```

The migration is idempotent and safe to re-run.

## Verify Policy Definitions

```sql
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'departments',
    'academic_years','rooms','courses','faculty','scheduled_courses',
    'faculty_preferences','scheduling_constraints','release_time',
    'pathways','pathway_courses'
  )
order by tablename, policyname;
```

Expected:
- INSERT/UPDATE policies on scheduling tables reference `public.can_write_schedule_data()`.
- DELETE policies reference `public.is_admin_role()`.
- Department write policies reference `public.is_admin_role()`.

## Smoke Check
Run the existing smoke check to confirm anonymous writes are blocked:

```bash
npm run check:rls
```

For role-specific behavior, test with authenticated user sessions that include role claim `admin` and `chair`.
