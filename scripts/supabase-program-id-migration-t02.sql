-- Tree/T-02: Add program_id columns and backfill existing EWU Design data
-- Idempotent migration: safe to re-run.

BEGIN;

-- 1) Canonical tenant table
CREATE TABLE IF NOT EXISTS public.programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_programs_created_by ON public.programs(created_by);

-- 2) Ensure EWU Design program exists
INSERT INTO public.programs (name, code, config)
VALUES ('EWU Design', 'ewu-design', '{"legacy_department_code":"DESN"}'::jsonb)
ON CONFLICT (code) DO UPDATE
SET
    name = EXCLUDED.name,
    updated_at = NOW();

-- Keep the tenant root table out of the public Data API until T-04 adds scoped policies.
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

-- 3) Add program_id to scoped tables, backfill, enforce constraints and defaults
DO $$
DECLARE
    v_program_id UUID;
    v_table TEXT;
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
    v_constraint_name TEXT;
BEGIN
    SELECT id INTO v_program_id
    FROM public.programs
    WHERE code = 'ewu-design'
    LIMIT 1;

    IF v_program_id IS NULL THEN
        RAISE EXCEPTION 'Could not resolve EWU Design program id for code=ewu-design';
    END IF;

    -- 3a) Add nullable program_id columns first
    FOREACH v_table IN ARRAY v_tables
    LOOP
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS program_id UUID', v_table);
    END LOOP;

    -- 3b) Backfill program_id values using existing hierarchy
    UPDATE public.departments d
    SET program_id = v_program_id
    WHERE d.program_id IS NULL;

    UPDATE public.academic_years ay
    SET program_id = COALESCE(d.program_id, v_program_id)
    FROM public.departments d
    WHERE ay.department_id = d.id
      AND ay.program_id IS NULL;

    UPDATE public.rooms r
    SET program_id = COALESCE(d.program_id, v_program_id)
    FROM public.departments d
    WHERE r.department_id = d.id
      AND r.program_id IS NULL;

    UPDATE public.courses c
    SET program_id = COALESCE(d.program_id, v_program_id)
    FROM public.departments d
    WHERE c.department_id = d.id
      AND c.program_id IS NULL;

    UPDATE public.faculty f
    SET program_id = COALESCE(d.program_id, v_program_id)
    FROM public.departments d
    WHERE f.department_id = d.id
      AND f.program_id IS NULL;

    UPDATE public.scheduling_constraints scn
    SET program_id = COALESCE(d.program_id, v_program_id)
    FROM public.departments d
    WHERE scn.department_id = d.id
      AND scn.program_id IS NULL;

    UPDATE public.pathways p
    SET program_id = COALESCE(d.program_id, v_program_id)
    FROM public.departments d
    WHERE p.department_id = d.id
      AND p.program_id IS NULL;

    UPDATE public.scheduled_courses sc
    SET program_id = ay.program_id
    FROM public.academic_years ay
    WHERE sc.academic_year_id = ay.id
      AND sc.program_id IS NULL;

    UPDATE public.scheduled_courses sc
    SET program_id = c.program_id
    FROM public.courses c
    WHERE sc.course_id = c.id
      AND sc.program_id IS NULL;

    UPDATE public.faculty_preferences fp
    SET program_id = f.program_id
    FROM public.faculty f
    WHERE fp.faculty_id = f.id
      AND fp.program_id IS NULL;

    UPDATE public.release_time rt
    SET program_id = f.program_id
    FROM public.faculty f
    WHERE rt.faculty_id = f.id
      AND rt.program_id IS NULL;

    UPDATE public.release_time rt
    SET program_id = ay.program_id
    FROM public.academic_years ay
    WHERE rt.academic_year_id = ay.id
      AND rt.program_id IS NULL;

    UPDATE public.pathway_courses pc
    SET program_id = p.program_id
    FROM public.pathways p
    WHERE pc.pathway_id = p.id
      AND pc.program_id IS NULL;

    UPDATE public.pathway_courses pc
    SET program_id = c.program_id
    FROM public.courses c
    WHERE pc.course_id = c.id
      AND pc.program_id IS NULL;

    -- Any remaining NULLs are legacy stragglers; assign to EWU Design for safe transition.
    FOREACH v_table IN ARRAY v_tables
    LOOP
        EXECUTE format('UPDATE public.%I SET program_id = %L::uuid WHERE program_id IS NULL', v_table, v_program_id::text);
    END LOOP;

    -- 3c) Temporary transition default so old inserts continue to work until app payloads are fully tenant-aware.
    FOREACH v_table IN ARRAY v_tables
    LOOP
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN program_id SET DEFAULT %L::uuid', v_table, v_program_id::text);
    END LOOP;

    -- 3d) Enforce non-null and FK constraints
    FOREACH v_table IN ARRAY v_tables
    LOOP
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN program_id SET NOT NULL', v_table);

        v_constraint_name := format('%s_program_id_fkey', v_table);
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = v_constraint_name
              AND conrelid = to_regclass('public.' || v_table)
        ) THEN
            EXECUTE format(
                'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (program_id) REFERENCES public.programs(id)',
                v_table,
                v_constraint_name
            );
        END IF;
    END LOOP;
END $$;

-- 4) program_id indexes for every scoped table
CREATE INDEX IF NOT EXISTS idx_departments_program_id ON public.departments(program_id);
CREATE INDEX IF NOT EXISTS idx_academic_years_program_id ON public.academic_years(program_id);
CREATE INDEX IF NOT EXISTS idx_rooms_program_id ON public.rooms(program_id);
CREATE INDEX IF NOT EXISTS idx_courses_program_id ON public.courses(program_id);
CREATE INDEX IF NOT EXISTS idx_faculty_program_id ON public.faculty(program_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_courses_program_id ON public.scheduled_courses(program_id);
CREATE INDEX IF NOT EXISTS idx_faculty_preferences_program_id ON public.faculty_preferences(program_id);
CREATE INDEX IF NOT EXISTS idx_scheduling_constraints_program_id ON public.scheduling_constraints(program_id);
CREATE INDEX IF NOT EXISTS idx_release_time_program_id ON public.release_time(program_id);
CREATE INDEX IF NOT EXISTS idx_pathways_program_id ON public.pathways(program_id);
CREATE INDEX IF NOT EXISTS idx_pathway_courses_program_id ON public.pathway_courses(program_id);

-- High-value query path indexes
CREATE INDEX IF NOT EXISTS idx_academic_years_program_year ON public.academic_years(program_id, year);
CREATE INDEX IF NOT EXISTS idx_scheduled_courses_program_year_quarter ON public.scheduled_courses(program_id, academic_year_id, quarter);
CREATE INDEX IF NOT EXISTS idx_scheduled_courses_program_faculty ON public.scheduled_courses(program_id, faculty_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_courses_program_room ON public.scheduled_courses(program_id, room_id);
CREATE INDEX IF NOT EXISTS idx_release_time_program_year ON public.release_time(program_id, academic_year_id);
CREATE INDEX IF NOT EXISTS idx_pathways_program_type_name ON public.pathways(program_id, type, name);
CREATE INDEX IF NOT EXISTS idx_pathway_courses_program_pathway ON public.pathway_courses(program_id, pathway_id);

COMMIT;
