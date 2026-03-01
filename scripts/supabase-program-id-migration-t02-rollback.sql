-- Tree/T-02 rollback: remove program_id migration artifacts
-- Use only for emergency reversal.

BEGIN;

DROP INDEX IF EXISTS public.idx_pathway_courses_program_pathway;
DROP INDEX IF EXISTS public.idx_pathways_program_type_name;
DROP INDEX IF EXISTS public.idx_release_time_program_year;
DROP INDEX IF EXISTS public.idx_scheduled_courses_program_room;
DROP INDEX IF EXISTS public.idx_scheduled_courses_program_faculty;
DROP INDEX IF EXISTS public.idx_scheduled_courses_program_year_quarter;
DROP INDEX IF EXISTS public.idx_academic_years_program_year;

DROP INDEX IF EXISTS public.idx_pathway_courses_program_id;
DROP INDEX IF EXISTS public.idx_pathways_program_id;
DROP INDEX IF EXISTS public.idx_release_time_program_id;
DROP INDEX IF EXISTS public.idx_scheduling_constraints_program_id;
DROP INDEX IF EXISTS public.idx_faculty_preferences_program_id;
DROP INDEX IF EXISTS public.idx_scheduled_courses_program_id;
DROP INDEX IF EXISTS public.idx_faculty_program_id;
DROP INDEX IF EXISTS public.idx_courses_program_id;
DROP INDEX IF EXISTS public.idx_rooms_program_id;
DROP INDEX IF EXISTS public.idx_academic_years_program_id;
DROP INDEX IF EXISTS public.idx_departments_program_id;

DO $$
DECLARE
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
BEGIN
    FOREACH v_table IN ARRAY v_tables
    LOOP
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', v_table, format('%s_program_id_fkey', v_table));

        IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = v_table
              AND column_name = 'program_id'
        ) THEN
            EXECUTE format('ALTER TABLE public.%I ALTER COLUMN program_id DROP DEFAULT', v_table);
            EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS program_id', v_table);
        END IF;
    END LOOP;
END $$;

DROP INDEX IF EXISTS public.idx_programs_created_by;
DROP TABLE IF EXISTS public.programs;

COMMIT;
