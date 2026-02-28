-- Tree/A-06: Save attribution columns + triggers
-- Idempotent migration to record who wrote each row and when.

BEGIN;

-- Add audit columns across scheduling/system tables.
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

ALTER TABLE public.academic_years ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.academic_years ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

ALTER TABLE public.faculty ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.faculty ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

ALTER TABLE public.scheduled_courses ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
ALTER TABLE public.scheduled_courses ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE public.faculty_preferences ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
ALTER TABLE public.faculty_preferences ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE public.scheduling_constraints ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.scheduling_constraints ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

ALTER TABLE public.release_time ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.release_time ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

ALTER TABLE public.pathways ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.pathways ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

ALTER TABLE public.pathway_courses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.pathway_courses ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

-- Backfill updated_at for historical rows.
UPDATE public.departments SET updated_at = COALESCE(updated_at, created_at, NOW()) WHERE updated_at IS NULL;
UPDATE public.academic_years SET updated_at = COALESCE(updated_at, created_at, NOW()) WHERE updated_at IS NULL;
UPDATE public.rooms SET updated_at = COALESCE(updated_at, created_at, NOW()) WHERE updated_at IS NULL;
UPDATE public.courses SET updated_at = COALESCE(updated_at, created_at, NOW()) WHERE updated_at IS NULL;
UPDATE public.faculty SET updated_at = COALESCE(updated_at, created_at, NOW()) WHERE updated_at IS NULL;
UPDATE public.scheduled_courses SET updated_at = COALESCE(updated_at, created_at, NOW()) WHERE updated_at IS NULL;
UPDATE public.faculty_preferences SET updated_at = COALESCE(updated_at, NOW()) WHERE updated_at IS NULL;
UPDATE public.scheduling_constraints SET updated_at = COALESCE(updated_at, created_at, NOW()) WHERE updated_at IS NULL;
UPDATE public.release_time SET updated_at = COALESCE(updated_at, created_at, NOW()) WHERE updated_at IS NULL;
UPDATE public.pathways SET updated_at = COALESCE(updated_at, created_at, NOW()) WHERE updated_at IS NULL;
UPDATE public.pathway_courses SET updated_at = COALESCE(updated_at, created_at, NOW()) WHERE updated_at IS NULL;

-- Trigger function: stamp updated_at and updated_by on every insert/update.
CREATE OR REPLACE FUNCTION public.set_row_write_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();

    IF auth.uid() IS NOT NULL THEN
        NEW.updated_by := auth.uid();
    END IF;

    RETURN NEW;
END;
$$;

-- Attach trigger to each table.
DROP TRIGGER IF EXISTS trg_write_audit_departments ON public.departments;
CREATE TRIGGER trg_write_audit_departments
    BEFORE INSERT OR UPDATE ON public.departments
    FOR EACH ROW EXECUTE FUNCTION public.set_row_write_audit_fields();

DROP TRIGGER IF EXISTS trg_write_audit_academic_years ON public.academic_years;
CREATE TRIGGER trg_write_audit_academic_years
    BEFORE INSERT OR UPDATE ON public.academic_years
    FOR EACH ROW EXECUTE FUNCTION public.set_row_write_audit_fields();

DROP TRIGGER IF EXISTS trg_write_audit_rooms ON public.rooms;
CREATE TRIGGER trg_write_audit_rooms
    BEFORE INSERT OR UPDATE ON public.rooms
    FOR EACH ROW EXECUTE FUNCTION public.set_row_write_audit_fields();

DROP TRIGGER IF EXISTS trg_write_audit_courses ON public.courses;
CREATE TRIGGER trg_write_audit_courses
    BEFORE INSERT OR UPDATE ON public.courses
    FOR EACH ROW EXECUTE FUNCTION public.set_row_write_audit_fields();

DROP TRIGGER IF EXISTS trg_write_audit_faculty ON public.faculty;
CREATE TRIGGER trg_write_audit_faculty
    BEFORE INSERT OR UPDATE ON public.faculty
    FOR EACH ROW EXECUTE FUNCTION public.set_row_write_audit_fields();

DROP TRIGGER IF EXISTS trg_write_audit_scheduled_courses ON public.scheduled_courses;
CREATE TRIGGER trg_write_audit_scheduled_courses
    BEFORE INSERT OR UPDATE ON public.scheduled_courses
    FOR EACH ROW EXECUTE FUNCTION public.set_row_write_audit_fields();

DROP TRIGGER IF EXISTS trg_write_audit_faculty_preferences ON public.faculty_preferences;
CREATE TRIGGER trg_write_audit_faculty_preferences
    BEFORE INSERT OR UPDATE ON public.faculty_preferences
    FOR EACH ROW EXECUTE FUNCTION public.set_row_write_audit_fields();

DROP TRIGGER IF EXISTS trg_write_audit_scheduling_constraints ON public.scheduling_constraints;
CREATE TRIGGER trg_write_audit_scheduling_constraints
    BEFORE INSERT OR UPDATE ON public.scheduling_constraints
    FOR EACH ROW EXECUTE FUNCTION public.set_row_write_audit_fields();

DROP TRIGGER IF EXISTS trg_write_audit_release_time ON public.release_time;
CREATE TRIGGER trg_write_audit_release_time
    BEFORE INSERT OR UPDATE ON public.release_time
    FOR EACH ROW EXECUTE FUNCTION public.set_row_write_audit_fields();

DROP TRIGGER IF EXISTS trg_write_audit_pathways ON public.pathways;
CREATE TRIGGER trg_write_audit_pathways
    BEFORE INSERT OR UPDATE ON public.pathways
    FOR EACH ROW EXECUTE FUNCTION public.set_row_write_audit_fields();

DROP TRIGGER IF EXISTS trg_write_audit_pathway_courses ON public.pathway_courses;
CREATE TRIGGER trg_write_audit_pathway_courses
    BEFORE INSERT OR UPDATE ON public.pathway_courses
    FOR EACH ROW EXECUTE FUNCTION public.set_row_write_audit_fields();

COMMIT;
