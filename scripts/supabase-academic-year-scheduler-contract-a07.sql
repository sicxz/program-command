-- Issue #198 / Tree/A-07:
-- Freeze scheduler slot/day semantics at the academic-year level.
--
-- This migration adds a year-scoped scheduler contract snapshot so persisted
-- `scheduled_courses.day_pattern` and `scheduled_courses.time_slot` values can
-- be interpreted against the scheduler rules that were active for that year.
--
-- Deliberately does not attempt a blanket backfill for every department/year.
-- Existing years should be backfilled with the correct program snapshot before
-- DB-first hydration is enabled.

BEGIN;

ALTER TABLE public.academic_years
    ADD COLUMN IF NOT EXISTS scheduler_profile_version VARCHAR(255);

ALTER TABLE public.academic_years
    ADD COLUMN IF NOT EXISTS scheduler_profile_snapshot JSONB;

ALTER TABLE public.scheduled_courses
    ALTER COLUMN day_pattern TYPE TEXT USING day_pattern::TEXT;

ALTER TABLE public.scheduled_courses
    ALTER COLUMN time_slot TYPE TEXT USING time_slot::TEXT;

COMMENT ON COLUMN public.academic_years.scheduler_profile_version IS
    'Profile/version identifier captured when the academic year scheduler contract was created.';

COMMENT ON COLUMN public.academic_years.scheduler_profile_snapshot IS
    'Frozen scheduler contract JSON for the academic year, including canonical dayPatterns and timeSlots.';

COMMIT;
