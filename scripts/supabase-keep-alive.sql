-- Read-only RPC used by the external GitHub Actions keep-alive request.
-- Idempotent: safe to run multiple times in the Supabase SQL Editor.

begin;

create or replace function public.keep_alive()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select now();
$$;

revoke all on function public.keep_alive() from public;
grant execute on function public.keep_alive() to anon;

commit;
