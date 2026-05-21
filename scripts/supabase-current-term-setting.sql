-- Public default term: which academic year + quarter the no-login public schedule
-- shows first. Read anonymously by public-schedule.html; written by an authenticated
-- chair from Academic Year Setup. Idempotent: safe to run multiple times.
--
-- Mirrors the access model of get_public_schedule (SECURITY DEFINER + explicit
-- allowlists + REVOKE/GRANT). The settings table itself is never read or written
-- directly by clients; all access flows through the two functions below.

BEGIN;

CREATE TABLE IF NOT EXISTS public.public_schedule_settings (
    program_code TEXT PRIMARY KEY,
    current_academic_year TEXT NOT NULL DEFAULT '2026-27',
    current_quarter TEXT NOT NULL DEFAULT 'fall',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID
);

-- Lock the table down: no direct client access. The SECURITY DEFINER functions
-- below are the only sanctioned read/write path.
ALTER TABLE public.public_schedule_settings ENABLE ROW LEVEL SECURITY;

-- Seed the EWU Design default if it is not already present.
INSERT INTO public.public_schedule_settings (program_code, current_academic_year, current_quarter)
VALUES ('ewu-design', '2026-27', 'fall')
ON CONFLICT (program_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Anonymous read: the public default term for a program, with safe fallback.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_current_term(
    p_program_code TEXT DEFAULT 'ewu-design'
)
RETURNS TABLE (
    academic_year TEXT,
    quarter TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_program_code TEXT := lower(btrim(coalesce(p_program_code, '')));
    v_allowed_years CONSTANT TEXT[] := ARRAY['2026-27', '2025-26', '2024-25', '2023-24'];
    v_allowed_quarters CONSTANT TEXT[] := ARRAY['fall', 'winter', 'spring'];
    v_found BOOLEAN := false;
BEGIN
    -- Public surface is intentionally allowlisted to EWU Design (matches
    -- get_public_schedule). Anything else returns the safe default below.
    IF v_program_code = 'ewu-design' THEN
        RETURN QUERY
        SELECT
            CASE WHEN s.current_academic_year = ANY (v_allowed_years)
                 THEN s.current_academic_year ELSE '2026-27' END::TEXT,
            CASE WHEN lower(s.current_quarter) = ANY (v_allowed_quarters)
                 THEN lower(s.current_quarter) ELSE 'fall' END::TEXT
        FROM public.public_schedule_settings s
        WHERE s.program_code = v_program_code;

        GET DIAGNOSTICS v_found = ROW_COUNT;
        IF v_found THEN
            RETURN;
        END IF;
    END IF;

    -- Fallback when no row exists or the program is not public.
    RETURN QUERY SELECT '2026-27'::TEXT, 'fall'::TEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- Authenticated write: validate then upsert the public default term.
-- Restricted to signed-in users; the page is itself behind the auth guard.
-- Tightening this to admin-only is a follow-up once a SQL-side role check exists.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_public_current_term(
    p_program_code TEXT,
    p_academic_year TEXT,
    p_quarter TEXT
)
RETURNS public.public_schedule_settings
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_program_code TEXT := lower(btrim(coalesce(p_program_code, '')));
    v_year TEXT := btrim(coalesce(p_academic_year, ''));
    v_quarter TEXT := lower(btrim(coalesce(p_quarter, '')));
    v_allowed_years CONSTANT TEXT[] := ARRAY['2026-27', '2025-26', '2024-25', '2023-24'];
    v_allowed_quarters CONSTANT TEXT[] := ARRAY['fall', 'winter', 'spring'];
    v_row public.public_schedule_settings;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authorized: sign in to set the public term.';
    END IF;
    IF v_program_code <> 'ewu-design' THEN
        RAISE EXCEPTION 'Unknown program code: %', p_program_code;
    END IF;
    IF NOT (v_year = ANY (v_allowed_years)) THEN
        RAISE EXCEPTION 'Academic year % is not in the public allowlist.', p_academic_year;
    END IF;
    IF NOT (v_quarter = ANY (v_allowed_quarters)) THEN
        RAISE EXCEPTION 'Quarter % must be fall, winter, or spring.', p_quarter;
    END IF;

    INSERT INTO public.public_schedule_settings AS s
        (program_code, current_academic_year, current_quarter, updated_at, updated_by)
    VALUES (v_program_code, v_year, v_quarter, now(), auth.uid())
    ON CONFLICT (program_code) DO UPDATE
        SET current_academic_year = EXCLUDED.current_academic_year,
            current_quarter = EXCLUDED.current_quarter,
            updated_at = now(),
            updated_by = auth.uid()
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_current_term(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_current_term(TEXT)
TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_public_current_term(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_public_current_term(TEXT, TEXT, TEXT)
TO authenticated, service_role;

COMMIT;
