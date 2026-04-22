-- Tree/T-04: Add current_program() SQL helper (JWT claim + user_programs fallback)
-- Idempotent migration: safe to re-run.

BEGIN;

-- Ensure tenant root table exists (created in T-02, included here for safety).
CREATE TABLE IF NOT EXISTS public.programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User-to-program membership map used as current_program() fallback.
CREATE TABLE IF NOT EXISTS public.user_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_programs_user_program_unique UNIQUE (user_id, program_id),
    CONSTRAINT user_programs_role_check CHECK (role IN ('member', 'chair', 'program_admin', 'platform_admin'))
);

CREATE INDEX IF NOT EXISTS idx_user_programs_user_id ON public.user_programs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_programs_program_id ON public.user_programs(program_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_programs_single_default
    ON public.user_programs(user_id)
    WHERE is_default;

CREATE OR REPLACE FUNCTION public.touch_user_programs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_user_programs_updated_at ON public.user_programs;
CREATE TRIGGER trg_touch_user_programs_updated_at
    BEFORE UPDATE ON public.user_programs
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_user_programs_updated_at();

-- Helper: parse app_metadata.program_id claim safely from JWT.
CREATE OR REPLACE FUNCTION public.jwt_program_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
    SELECT CASE
        WHEN auth.uid() IS NULL THEN NULL
        WHEN COALESCE(auth.jwt() -> 'app_metadata' ->> 'program_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN (auth.jwt() -> 'app_metadata' ->> 'program_id')::uuid
        ELSE NULL
    END;
$$;

-- Main helper for tenant-scoped RLS checks.
-- Preferred source: JWT app_metadata.program_id.
-- Fallback source: public.user_programs by auth.uid().
CREATE OR REPLACE FUNCTION public.current_program()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        public.jwt_program_id(),
        (
            SELECT up.program_id
            FROM public.user_programs up
            WHERE up.user_id = auth.uid()
            ORDER BY up.is_default DESC, up.updated_at DESC, up.created_at DESC
            LIMIT 1
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT auth.uid() IS NOT NULL
      AND lower(COALESCE(
            auth.jwt() -> 'app_metadata' ->> 'role',
            auth.jwt() ->> 'role',
            ''
      )) IN ('admin', 'platform_admin');
$$;

-- Keep auth.users.raw_app_meta_data.program_id in sync with default user_programs membership.
-- This updates future JWTs issued at sign-in/refresh without needing client-side mutation.
CREATE OR REPLACE FUNCTION public.sync_user_program_claims(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_program_id UUID;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN;
    END IF;

    SELECT up.program_id INTO v_program_id
    FROM public.user_programs up
    WHERE up.user_id = p_user_id
    ORDER BY up.is_default DESC, up.updated_at DESC, up.created_at DESC
    LIMIT 1;

    UPDATE auth.users u
    SET raw_app_meta_data = CASE
        WHEN v_program_id IS NULL
            THEN COALESCE(u.raw_app_meta_data, '{}'::jsonb) - 'program_id'
        ELSE jsonb_set(
            COALESCE(u.raw_app_meta_data, '{}'::jsonb),
            '{program_id}',
            to_jsonb(v_program_id::text),
            true
        )
    END
    WHERE u.id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_user_program_claims_from_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    PERFORM public.sync_user_program_claims(COALESCE(NEW.user_id, OLD.user_id));
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_user_program_claims ON public.user_programs;
CREATE TRIGGER trg_sync_user_program_claims
    AFTER INSERT OR UPDATE OR DELETE ON public.user_programs
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_user_program_claims_from_membership();

ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "programs_select_current_or_platform_admin" ON public.programs;
CREATE POLICY "programs_select_current_or_platform_admin"
    ON public.programs
    FOR SELECT TO authenticated
    USING (id = public.current_program() OR public.is_platform_admin());

DROP POLICY IF EXISTS "programs_insert_platform_admin_only" ON public.programs;
CREATE POLICY "programs_insert_platform_admin_only"
    ON public.programs
    FOR INSERT TO authenticated
    WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "programs_update_platform_admin_only" ON public.programs;
CREATE POLICY "programs_update_platform_admin_only"
    ON public.programs
    FOR UPDATE TO authenticated
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "programs_delete_platform_admin_only" ON public.programs;
CREATE POLICY "programs_delete_platform_admin_only"
    ON public.programs
    FOR DELETE TO authenticated
    USING (public.is_platform_admin());

DROP POLICY IF EXISTS "user_programs_select_self_or_platform_admin" ON public.user_programs;
CREATE POLICY "user_programs_select_self_or_platform_admin"
    ON public.user_programs
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_platform_admin());

DROP POLICY IF EXISTS "user_programs_modify_platform_admin_only" ON public.user_programs;
CREATE POLICY "user_programs_modify_platform_admin_only"
    ON public.user_programs
    FOR ALL TO authenticated
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());

-- Backfill metadata claims for any existing memberships.
DO $$
DECLARE
    v_user_id UUID;
BEGIN
    FOR v_user_id IN
        SELECT DISTINCT user_id
        FROM public.user_programs
    LOOP
        PERFORM public.sync_user_program_claims(v_user_id);
    END LOOP;
END;
$$;

COMMIT;
