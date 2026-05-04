# T-04 Current Program Helper

Issue: [#102](https://github.com/sicxz/program-command/issues/102)

## Migration
Run:

- `scripts/supabase-current-program-helper-t04.sql`

This migration adds:

- scoped RLS policies for `public.programs`
- `public.user_programs` mapping table (`user_id` ↔ `program_id`)
- `public.jwt_program_id()` helper (safe JWT claim parse)
- `public.current_program()` helper for RLS policy usage
- metadata sync triggers so `auth.users.raw_app_meta_data.program_id` tracks membership defaults

## Behavior

`public.current_program()` resolves in order:

1. `auth.jwt() -> app_metadata.program_id` (preferred)
2. fallback query from `public.user_programs` for `auth.uid()`

It returns `NULL` for unauthenticated calls.

## Verification Queries

Run these in Supabase SQL editor after migration:

```sql
-- Confirm helper functions exist and are STABLE
select proname, provolatile
from pg_proc
where proname in ('jwt_program_id', 'current_program', 'is_platform_admin')
order by proname;

-- Should return either a UUID (if claim or fallback mapping exists) or NULL
select public.current_program();

-- Validate fallback mapping table
select user_id, program_id, role, is_default
from public.user_programs
order by updated_at desc
limit 20;

-- Confirm programs RLS is enabled and policies are present
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'programs'
order by policyname;
```

Expected `provolatile`:

- `s` for all helper functions above (`STABLE`).

Expected program policies:

- `programs_select_current_or_platform_admin`
- `programs_insert_platform_admin_only`
- `programs_update_platform_admin_only`
- `programs_delete_platform_admin_only`
