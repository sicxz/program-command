-- Tree/A-05: Scope Supabase writes by authenticated user role (admin vs chair)
-- Idempotent: safe to run multiple times.

BEGIN;

-- Role helpers based on Supabase JWT claims.
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

-- Remove previous operation policies so this script is re-runnable.
DROP POLICY IF EXISTS "auth_insert_departments" ON public.departments;
DROP POLICY IF EXISTS "auth_update_departments" ON public.departments;
DROP POLICY IF EXISTS "auth_delete_departments" ON public.departments;
DROP POLICY IF EXISTS "auth_insert_academic_years" ON public.academic_years;
DROP POLICY IF EXISTS "auth_update_academic_years" ON public.academic_years;
DROP POLICY IF EXISTS "auth_delete_academic_years" ON public.academic_years;
DROP POLICY IF EXISTS "auth_insert_rooms" ON public.rooms;
DROP POLICY IF EXISTS "auth_update_rooms" ON public.rooms;
DROP POLICY IF EXISTS "auth_delete_rooms" ON public.rooms;
DROP POLICY IF EXISTS "auth_insert_courses" ON public.courses;
DROP POLICY IF EXISTS "auth_update_courses" ON public.courses;
DROP POLICY IF EXISTS "auth_delete_courses" ON public.courses;
DROP POLICY IF EXISTS "auth_insert_faculty" ON public.faculty;
DROP POLICY IF EXISTS "auth_update_faculty" ON public.faculty;
DROP POLICY IF EXISTS "auth_delete_faculty" ON public.faculty;
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

-- departments (system config): admin writes only
CREATE POLICY "auth_insert_departments" ON public.departments
    FOR INSERT TO authenticated
    WITH CHECK (public.is_admin_role());
CREATE POLICY "auth_update_departments" ON public.departments
    FOR UPDATE TO authenticated
    USING (public.is_admin_role())
    WITH CHECK (public.is_admin_role());
CREATE POLICY "auth_delete_departments" ON public.departments
    FOR DELETE TO authenticated
    USING (public.is_admin_role());

-- academic_years
CREATE POLICY "auth_insert_academic_years" ON public.academic_years
    FOR INSERT TO authenticated
    WITH CHECK (public.can_write_schedule_data());
CREATE POLICY "auth_update_academic_years" ON public.academic_years
    FOR UPDATE TO authenticated
    USING (public.can_write_schedule_data())
    WITH CHECK (public.can_write_schedule_data());
CREATE POLICY "auth_delete_academic_years" ON public.academic_years
    FOR DELETE TO authenticated
    USING (public.is_admin_role());

-- rooms
CREATE POLICY "auth_insert_rooms" ON public.rooms
    FOR INSERT TO authenticated
    WITH CHECK (public.can_write_schedule_data());
CREATE POLICY "auth_update_rooms" ON public.rooms
    FOR UPDATE TO authenticated
    USING (public.can_write_schedule_data())
    WITH CHECK (public.can_write_schedule_data());
CREATE POLICY "auth_delete_rooms" ON public.rooms
    FOR DELETE TO authenticated
    USING (public.is_admin_role());

-- courses
CREATE POLICY "auth_insert_courses" ON public.courses
    FOR INSERT TO authenticated
    WITH CHECK (public.can_write_schedule_data());
CREATE POLICY "auth_update_courses" ON public.courses
    FOR UPDATE TO authenticated
    USING (public.can_write_schedule_data())
    WITH CHECK (public.can_write_schedule_data());
CREATE POLICY "auth_delete_courses" ON public.courses
    FOR DELETE TO authenticated
    USING (public.is_admin_role());

-- faculty
CREATE POLICY "auth_insert_faculty" ON public.faculty
    FOR INSERT TO authenticated
    WITH CHECK (public.can_write_schedule_data());
CREATE POLICY "auth_update_faculty" ON public.faculty
    FOR UPDATE TO authenticated
    USING (public.can_write_schedule_data())
    WITH CHECK (public.can_write_schedule_data());
CREATE POLICY "auth_delete_faculty" ON public.faculty
    FOR DELETE TO authenticated
    USING (public.is_admin_role());

-- scheduled_courses
CREATE POLICY "auth_insert_scheduled_courses" ON public.scheduled_courses
    FOR INSERT TO authenticated
    WITH CHECK (public.can_write_schedule_data());
CREATE POLICY "auth_update_scheduled_courses" ON public.scheduled_courses
    FOR UPDATE TO authenticated
    USING (public.can_write_schedule_data())
    WITH CHECK (public.can_write_schedule_data());
CREATE POLICY "auth_delete_scheduled_courses" ON public.scheduled_courses
    FOR DELETE TO authenticated
    USING (public.is_admin_role());

-- faculty_preferences
CREATE POLICY "auth_insert_faculty_preferences" ON public.faculty_preferences
    FOR INSERT TO authenticated
    WITH CHECK (public.can_write_schedule_data());
CREATE POLICY "auth_update_faculty_preferences" ON public.faculty_preferences
    FOR UPDATE TO authenticated
    USING (public.can_write_schedule_data())
    WITH CHECK (public.can_write_schedule_data());
CREATE POLICY "auth_delete_faculty_preferences" ON public.faculty_preferences
    FOR DELETE TO authenticated
    USING (public.is_admin_role());

-- scheduling_constraints
CREATE POLICY "auth_insert_scheduling_constraints" ON public.scheduling_constraints
    FOR INSERT TO authenticated
    WITH CHECK (public.can_write_schedule_data());
CREATE POLICY "auth_update_scheduling_constraints" ON public.scheduling_constraints
    FOR UPDATE TO authenticated
    USING (public.can_write_schedule_data())
    WITH CHECK (public.can_write_schedule_data());
CREATE POLICY "auth_delete_scheduling_constraints" ON public.scheduling_constraints
    FOR DELETE TO authenticated
    USING (public.is_admin_role());

-- release_time
CREATE POLICY "auth_insert_release_time" ON public.release_time
    FOR INSERT TO authenticated
    WITH CHECK (public.can_write_schedule_data());
CREATE POLICY "auth_update_release_time" ON public.release_time
    FOR UPDATE TO authenticated
    USING (public.can_write_schedule_data())
    WITH CHECK (public.can_write_schedule_data());
CREATE POLICY "auth_delete_release_time" ON public.release_time
    FOR DELETE TO authenticated
    USING (public.is_admin_role());

-- pathways
CREATE POLICY "auth_insert_pathways" ON public.pathways
    FOR INSERT TO authenticated
    WITH CHECK (public.can_write_schedule_data());
CREATE POLICY "auth_update_pathways" ON public.pathways
    FOR UPDATE TO authenticated
    USING (public.can_write_schedule_data())
    WITH CHECK (public.can_write_schedule_data());
CREATE POLICY "auth_delete_pathways" ON public.pathways
    FOR DELETE TO authenticated
    USING (public.is_admin_role());

-- pathway_courses
CREATE POLICY "auth_insert_pathway_courses" ON public.pathway_courses
    FOR INSERT TO authenticated
    WITH CHECK (public.can_write_schedule_data());
CREATE POLICY "auth_update_pathway_courses" ON public.pathway_courses
    FOR UPDATE TO authenticated
    USING (public.can_write_schedule_data())
    WITH CHECK (public.can_write_schedule_data());
CREATE POLICY "auth_delete_pathway_courses" ON public.pathway_courses
    FOR DELETE TO authenticated
    USING (public.is_admin_role());

COMMIT;
