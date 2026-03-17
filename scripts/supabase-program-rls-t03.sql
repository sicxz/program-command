-- Tree/T-03: Program-scoped RLS policies using current_program()
-- Idempotent migration: safe to re-run.
-- Dependency: scripts/supabase-current-program-helper-t04.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.auth_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT lower(coalesce(
        nullif(auth.jwt() ->> 'role', ''),
        nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''),
        nullif(auth.jwt() -> 'user_metadata' ->> 'role', ''),
        nullif(auth.jwt() -> 'raw_user_meta_data' ->> 'role', '')
    ));
$$;

CREATE OR REPLACE FUNCTION public.is_admin_role()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT auth.uid() IS NOT NULL
       AND public.auth_role() = 'admin';
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT auth.uid() IS NOT NULL
       AND public.auth_role() IN ('admin', 'platform_admin');
$$;

CREATE OR REPLACE FUNCTION public.is_chair_role()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT auth.uid() IS NOT NULL
       AND public.auth_role() = 'chair';
$$;

CREATE OR REPLACE FUNCTION public.can_write_schedule_data()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT public.is_admin_role() OR public.is_chair_role();
$$;

DO $$
DECLARE
    v_table TEXT;
    v_policy RECORD;
    v_tables TEXT[] := ARRAY[
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
    ];
    v_scope_expr TEXT := '(public.is_platform_admin() OR program_id = public.current_program())';
    v_insert_update_expr TEXT;
    v_delete_expr TEXT;
BEGIN
    IF to_regprocedure('public.current_program()') IS NULL THEN
        RAISE EXCEPTION 'Missing dependency: public.current_program(). Run T-04 migration first.';
    END IF;

    FOREACH v_table IN ARRAY v_tables
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = v_table
              AND column_name = 'program_id'
        ) THEN
            RAISE EXCEPTION 'Table public.% is missing required program_id column. Run T-02 migration first.', v_table;
        END IF;

        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);

        -- Clear prior policies to avoid conflicts and stale non-program scopes.
        FOR v_policy IN
            SELECT policyname
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = v_table
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy.policyname, v_table);
        END LOOP;

        IF v_table = 'departments' THEN
            v_insert_update_expr := '(public.is_admin_role() AND ' || v_scope_expr || ')';
            v_delete_expr := '(public.is_admin_role() AND ' || v_scope_expr || ')';
        ELSE
            v_insert_update_expr := '(public.can_write_schedule_data() AND ' || v_scope_expr || ')';
            v_delete_expr := '(public.is_admin_role() AND ' || v_scope_expr || ')';
        END IF;

        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
            format('t03_select_%s', v_table),
            v_table,
            v_scope_expr
        );

        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
            format('t03_insert_%s', v_table),
            v_table,
            v_insert_update_expr
        );

        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
            format('t03_update_%s', v_table),
            v_table,
            v_insert_update_expr,
            v_insert_update_expr
        );

        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
            format('t03_delete_%s', v_table),
            v_table,
            v_delete_expr
        );
    END LOOP;
END $$;

COMMIT;
