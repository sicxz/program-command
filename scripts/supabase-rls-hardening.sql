-- Tree/C-06: Supabase RLS hardening migration for scheduling writes
-- Idempotent: safe to run multiple times.

BEGIN;

-- Remove legacy broad write policies.
DROP POLICY IF EXISTS "Authenticated write" ON public.departments;
DROP POLICY IF EXISTS "Authenticated write" ON public.academic_years;
DROP POLICY IF EXISTS "Authenticated write" ON public.rooms;
DROP POLICY IF EXISTS "Authenticated write" ON public.courses;
DROP POLICY IF EXISTS "Authenticated write" ON public.faculty;
DROP POLICY IF EXISTS "Authenticated write" ON public.scheduled_courses;
DROP POLICY IF EXISTS "Authenticated write" ON public.faculty_preferences;
DROP POLICY IF EXISTS "Authenticated write" ON public.scheduling_constraints;
DROP POLICY IF EXISTS "Authenticated write" ON public.release_time;
DROP POLICY IF EXISTS "Authenticated write" ON public.pathways;
DROP POLICY IF EXISTS "Authenticated write" ON public.pathway_courses;

-- Remove previous operation-scoped policies if they exist.
DROP POLICY IF EXISTS "auth_insert_academic_years" ON public.academic_years;
DROP POLICY IF EXISTS "auth_update_academic_years" ON public.academic_years;
DROP POLICY IF EXISTS "auth_insert_rooms" ON public.rooms;
DROP POLICY IF EXISTS "auth_update_rooms" ON public.rooms;
DROP POLICY IF EXISTS "auth_insert_courses" ON public.courses;
DROP POLICY IF EXISTS "auth_update_courses" ON public.courses;
DROP POLICY IF EXISTS "auth_insert_faculty" ON public.faculty;
DROP POLICY IF EXISTS "auth_update_faculty" ON public.faculty;
DROP POLICY IF EXISTS "auth_insert_scheduled_courses" ON public.scheduled_courses;
DROP POLICY IF EXISTS "auth_update_scheduled_courses" ON public.scheduled_courses;
DROP POLICY IF EXISTS "auth_delete_scheduled_courses" ON public.scheduled_courses;
DROP POLICY IF EXISTS "auth_insert_faculty_preferences" ON public.faculty_preferences;
DROP POLICY IF EXISTS "auth_update_faculty_preferences" ON public.faculty_preferences;
DROP POLICY IF EXISTS "auth_delete_faculty_preferences" ON public.faculty_preferences;
DROP POLICY IF EXISTS "auth_insert_scheduling_constraints" ON public.scheduling_constraints;
DROP POLICY IF EXISTS "auth_update_scheduling_constraints" ON public.scheduling_constraints;
DROP POLICY IF EXISTS "auth_delete_scheduling_constraints" ON public.scheduling_constraints;
DROP POLICY IF EXISTS "auth_insert_release_time" ON public.release_time;
DROP POLICY IF EXISTS "auth_update_release_time" ON public.release_time;
DROP POLICY IF EXISTS "auth_delete_release_time" ON public.release_time;
DROP POLICY IF EXISTS "auth_insert_pathways" ON public.pathways;
DROP POLICY IF EXISTS "auth_update_pathways" ON public.pathways;
DROP POLICY IF EXISTS "auth_delete_pathways" ON public.pathways;
DROP POLICY IF EXISTS "auth_insert_pathway_courses" ON public.pathway_courses;
DROP POLICY IF EXISTS "auth_update_pathway_courses" ON public.pathway_courses;
DROP POLICY IF EXISTS "auth_delete_pathway_courses" ON public.pathway_courses;

-- Departments remain read-only for authenticated clients.
-- Writes for this table are expected to use service_role only.

-- academic_years
CREATE POLICY "auth_insert_academic_years" ON public.academic_years
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_academic_years" ON public.academic_years
    FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

-- rooms
CREATE POLICY "auth_insert_rooms" ON public.rooms
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_rooms" ON public.rooms
    FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

-- courses
CREATE POLICY "auth_insert_courses" ON public.courses
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_courses" ON public.courses
    FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

-- faculty
CREATE POLICY "auth_insert_faculty" ON public.faculty
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_faculty" ON public.faculty
    FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

-- scheduled_courses
CREATE POLICY "auth_insert_scheduled_courses" ON public.scheduled_courses
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_scheduled_courses" ON public.scheduled_courses
    FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_scheduled_courses" ON public.scheduled_courses
    FOR DELETE TO authenticated
    USING (auth.uid() IS NOT NULL);

-- faculty_preferences
CREATE POLICY "auth_insert_faculty_preferences" ON public.faculty_preferences
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_faculty_preferences" ON public.faculty_preferences
    FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_faculty_preferences" ON public.faculty_preferences
    FOR DELETE TO authenticated
    USING (auth.uid() IS NOT NULL);

-- scheduling_constraints
CREATE POLICY "auth_insert_scheduling_constraints" ON public.scheduling_constraints
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_scheduling_constraints" ON public.scheduling_constraints
    FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_scheduling_constraints" ON public.scheduling_constraints
    FOR DELETE TO authenticated
    USING (auth.uid() IS NOT NULL);

-- release_time
CREATE POLICY "auth_insert_release_time" ON public.release_time
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_release_time" ON public.release_time
    FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_release_time" ON public.release_time
    FOR DELETE TO authenticated
    USING (auth.uid() IS NOT NULL);

-- pathways
CREATE POLICY "auth_insert_pathways" ON public.pathways
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_pathways" ON public.pathways
    FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_pathways" ON public.pathways
    FOR DELETE TO authenticated
    USING (auth.uid() IS NOT NULL);

-- pathway_courses
CREATE POLICY "auth_insert_pathway_courses" ON public.pathway_courses
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_pathway_courses" ON public.pathway_courses
    FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_pathway_courses" ON public.pathway_courses
    FOR DELETE TO authenticated
    USING (auth.uid() IS NOT NULL);

COMMIT;
