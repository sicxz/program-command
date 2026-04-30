-- Public read-only schedule projection for the no-login schedule view.
-- Idempotent: safe to run multiple times.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_public_schedule(
    p_academic_year TEXT DEFAULT '2026-27',
    p_program_code TEXT DEFAULT 'ewu-design',
    p_quarter TEXT DEFAULT NULL
)
RETURNS TABLE (
    academic_year TEXT,
    quarter TEXT,
    day_pattern TEXT,
    time_slot TEXT,
    section TEXT,
    course_code TEXT,
    course_title TEXT,
    credits INTEGER,
    instructor_name TEXT,
    room_code TEXT,
    projected_enrollment INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_academic_year TEXT := btrim(coalesce(p_academic_year, ''));
    v_program_code TEXT := lower(btrim(coalesce(p_program_code, '')));
    v_quarter TEXT := nullif(lower(btrim(coalesce(p_quarter, ''))), '');
    v_department_code TEXT;
    v_allowed_years CONSTANT TEXT[] := ARRAY['2026-27', '2025-26', '2024-25', '2023-24'];
    v_has_program_scope BOOLEAN := false;
BEGIN
    -- Public releases are intentionally allowlisted. Future public years should be
    -- added through an explicit publishing model, not broad anonymous table reads.
    IF NOT (v_academic_year = ANY (v_allowed_years)) OR v_program_code <> 'ewu-design' THEN
        RETURN;
    END IF;

    v_department_code := 'DESN';

    SELECT
        to_regclass('public.programs') IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'academic_years'
              AND column_name = 'program_id'
        )
        AND EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'scheduled_courses'
              AND column_name = 'program_id'
        )
        AND EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'courses'
              AND column_name = 'program_id'
        )
        AND EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'faculty'
              AND column_name = 'program_id'
        )
        AND EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'rooms'
              AND column_name = 'program_id'
        )
    INTO v_has_program_scope;

    IF NOT v_has_program_scope THEN
        -- Current production still uses the legacy department_id schema. Keep this
        -- fallback narrow to EWU Design and the explicit public year allowlist.
        RETURN QUERY
        SELECT
            ay.year::TEXT AS academic_year,
            sc.quarter::TEXT AS quarter,
            sc.day_pattern::TEXT AS day_pattern,
            sc.time_slot::TEXT AS time_slot,
            sc.section::TEXT AS section,
            coalesce(c.code, 'TBD')::TEXT AS course_code,
            coalesce(c.title, 'TBD Course')::TEXT AS course_title,
            coalesce(c.default_credits, 5)::INTEGER AS credits,
            coalesce(f.name, 'TBD')::TEXT AS instructor_name,
            coalesce(
                r.room_code,
                CASE
                    WHEN upper(coalesce(sc.day_pattern, '')) = 'ONLINE' THEN 'ONLINE'
                    WHEN upper(coalesce(sc.day_pattern, '')) = 'ARRANGED' THEN 'ARRANGED'
                    ELSE 'TBD'
                END
            )::TEXT AS room_code,
            sc.projected_enrollment::INTEGER AS projected_enrollment
        FROM public.scheduled_courses sc
        JOIN public.academic_years ay
          ON ay.id = sc.academic_year_id
        JOIN public.departments d
          ON d.id = ay.department_id
        LEFT JOIN public.courses c
          ON c.id = sc.course_id
         AND c.department_id = d.id
        LEFT JOIN public.faculty f
          ON f.id = sc.faculty_id
         AND f.department_id = d.id
        LEFT JOIN public.rooms r
          ON r.id = sc.room_id
         AND r.department_id = d.id
        WHERE d.code = v_department_code
          AND ay.year = v_academic_year
          AND (v_quarter IS NULL OR lower(sc.quarter) = v_quarter)
        ORDER BY
            CASE lower(sc.quarter)
                WHEN 'fall' THEN 1
                WHEN 'winter' THEN 2
                WHEN 'spring' THEN 3
                ELSE 4
            END,
            sc.day_pattern NULLS LAST,
            sc.time_slot NULLS LAST,
            sc.section NULLS LAST,
            c.code NULLS LAST;

        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        ay.year::TEXT AS academic_year,
        sc.quarter::TEXT AS quarter,
        sc.day_pattern::TEXT AS day_pattern,
        sc.time_slot::TEXT AS time_slot,
        sc.section::TEXT AS section,
        coalesce(c.code, 'TBD')::TEXT AS course_code,
        coalesce(c.title, 'TBD Course')::TEXT AS course_title,
        coalesce(c.default_credits, 5)::INTEGER AS credits,
        coalesce(f.name, 'TBD')::TEXT AS instructor_name,
        coalesce(
            r.room_code,
            CASE
                WHEN upper(coalesce(sc.day_pattern, '')) = 'ONLINE' THEN 'ONLINE'
                WHEN upper(coalesce(sc.day_pattern, '')) = 'ARRANGED' THEN 'ARRANGED'
                ELSE 'TBD'
            END
        )::TEXT AS room_code,
        sc.projected_enrollment::INTEGER AS projected_enrollment
    FROM public.scheduled_courses sc
    JOIN public.academic_years ay
      ON ay.id = sc.academic_year_id
     AND ay.program_id = sc.program_id
    JOIN public.programs p
      ON p.id = sc.program_id
    LEFT JOIN public.courses c
      ON c.id = sc.course_id
     AND c.program_id = sc.program_id
    LEFT JOIN public.faculty f
      ON f.id = sc.faculty_id
     AND f.program_id = sc.program_id
    LEFT JOIN public.rooms r
      ON r.id = sc.room_id
     AND r.program_id = sc.program_id
    WHERE p.code = v_program_code
      AND ay.year = v_academic_year
      AND (v_quarter IS NULL OR lower(sc.quarter) = v_quarter)
    ORDER BY
        CASE lower(sc.quarter)
            WHEN 'fall' THEN 1
            WHEN 'winter' THEN 2
            WHEN 'spring' THEN 3
            ELSE 4
        END,
        sc.day_pattern NULLS LAST,
        sc.time_slot NULLS LAST,
        sc.section NULLS LAST,
        c.code NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_schedule(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_schedule(TEXT, TEXT, TEXT)
TO anon, authenticated, service_role;

COMMIT;
