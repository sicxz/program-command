-- Phase 0 — Path B: Tighten write policies to an explicit editor allowlist.
-- Idempotent: safe to re-run.
--
-- BEFORE: all 9 operational tables had auth_insert/update/delete_* policies
--         with check (auth.uid() IS NOT NULL) — any signed-up user could write.
-- AFTER : same policies enforce public.is_editor() — only rows in
--         public.editors can write. "Public read" SELECT policies are
--         UNCHANGED (anon + authenticated reads continue to work as today).
--
-- Rollback baseline: docs/phase0-snapshot-2026-05-19T21-51-35-228Z.sql
-- (replay with: node scripts/phase0-rls-cutover.mjs rollback <that-file>)

BEGIN;

-- 1) Editor allowlist (RLS on, no SELECT policy → only postgres/service_role
--    can read directly; the app reads it via SECURITY DEFINER is_editor()).
CREATE TABLE IF NOT EXISTS public.editors (
    user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email      text NOT NULL,
    role       text NOT NULL DEFAULT 'editor' CHECK (role IN ('editor','admin')),
    added_at   timestamptz NOT NULL DEFAULT now(),
    added_by   uuid REFERENCES auth.users(id)
);
ALTER TABLE public.editors ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT auth.uid() IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.editors e WHERE e.user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_editor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_editor() TO authenticated;

-- 2) Seed allowlist from confirmed accounts (resolve by email at insert time).
--    ON CONFLICT keeps re-runs harmless.
INSERT INTO public.editors (user_id, email, role)
SELECT u.id, u.email, 'editor'
  FROM auth.users u
 WHERE u.email IN (
       'tmasingale@ewu.edu',
       'tmasingale@me.com',
       'mbreen@ewu.edu',
       'rhunton1@ewu.edu'
 )
ON CONFLICT (user_id) DO NOTHING;

-- Hard fail if any seed account didn't resolve (typo / unconfirmed account).
DO $$
DECLARE missing int;
BEGIN
    SELECT count(*) INTO missing
      FROM (VALUES
          ('tmasingale@ewu.edu'),
          ('tmasingale@me.com'),
          ('mbreen@ewu.edu'),
          ('rhunton1@ewu.edu')
      ) AS seed(email)
     WHERE NOT EXISTS (
        SELECT 1 FROM public.editors e WHERE e.email = seed.email
     );
    IF missing > 0 THEN
        RAISE EXCEPTION 'Seed missing % editor row(s); aborting before policy swap.', missing;
    END IF;
END $$;

-- 3) Replace write policies on the 9 operational tables.
--    Drop the old auth_* check (auth.uid() IS NOT NULL) and re-create with
--    public.is_editor(). Loop is data-driven and skips tables that aren't
--    present (defensive — prod has all 9 today; characterize confirmed).
DO $$
DECLARE
    v_table text;
    v_tables text[] := ARRAY[
        'academic_years',
        'courses',
        'departments',
        'faculty',
        'faculty_preferences',
        'release_time',
        'rooms',
        'scheduled_courses',
        'scheduling_constraints'
    ];
    v_pol record;
BEGIN
    FOREACH v_table IN ARRAY v_tables LOOP
        IF to_regclass('public.' || v_table) IS NULL THEN
            CONTINUE;
        END IF;

        -- Drop both the prior auth_* policies and any pre-existing editor_*
        -- policies (so this script is re-runnable / converges on the desired state).
        FOR v_pol IN
            SELECT policyname
              FROM pg_policies
             WHERE schemaname = 'public'
               AND tablename  = v_table
               AND (policyname LIKE 'auth\_%'   ESCAPE '\'
                 OR policyname LIKE 'editor\_%' ESCAPE '\')
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_pol.policyname, v_table);
        END LOOP;

        -- Re-create INSERT/UPDATE/DELETE policies gated on is_editor().
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_editor())',
            'editor_insert_' || v_table, v_table);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor())',
            'editor_update_' || v_table, v_table);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_editor())',
            'editor_delete_' || v_table, v_table);
    END LOOP;
END $$;

COMMIT;

-- Post-state summary (read-only): cleanly visible in the apply output.
SELECT 'editors_seeded'  AS check, count(*)::text AS value FROM public.editors
UNION ALL
SELECT 'policies_with_is_editor',
       count(*)::text
  FROM pg_policies
 WHERE schemaname = 'public'
   AND (qual LIKE '%is_editor%' OR with_check LIKE '%is_editor%')
UNION ALL
SELECT 'policies_still_on_auth_uid',
       count(*)::text
  FROM pg_policies
 WHERE schemaname = 'public'
   AND (qual LIKE '%auth.uid() IS NOT NULL%' OR with_check LIKE '%auth.uid() IS NOT NULL%');
