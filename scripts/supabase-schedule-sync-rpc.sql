-- Atomic year-scoped scheduled_courses sync for Supabase/Postgres
-- Run in Supabase SQL editor (after base schema exists).

CREATE OR REPLACE FUNCTION public.sync_scheduled_courses_for_academic_year(
    p_academic_year_id UUID,
    p_records JSONB DEFAULT '[]'::JSONB
)
RETURNS TABLE (
    updated_count INTEGER,
    inserted_count INTEGER,
    deleted_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated INTEGER := 0;
    v_inserted INTEGER := 0;
    v_deleted INTEGER := 0;
BEGIN
    IF p_academic_year_id IS NULL THEN
        RAISE EXCEPTION 'p_academic_year_id is required';
    END IF;

    DROP TABLE IF EXISTS _incoming_schedule_sync;
    CREATE TEMP TABLE _incoming_schedule_sync (
        academic_year_id UUID NOT NULL,
        course_id UUID NULL,
        faculty_id UUID NULL,
        room_id UUID NULL,
        quarter VARCHAR(20) NOT NULL,
        day_pattern VARCHAR(10) NULL,
        time_slot VARCHAR(20) NULL,
        section VARCHAR(10) NULL,
        projected_enrollment INTEGER NULL,
        updated_by UUID NULL,
        updated_at TIMESTAMPTZ NULL,
        sync_key TEXT NOT NULL,
        row_rank INTEGER NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO _incoming_schedule_sync (
        academic_year_id,
        course_id,
        faculty_id,
        room_id,
        quarter,
        day_pattern,
        time_slot,
        section,
        projected_enrollment,
        updated_by,
        updated_at,
        sync_key,
        row_rank
    )
    WITH parsed AS (
        SELECT
            ord::INTEGER AS ordinal,
            p_academic_year_id AS academic_year_id,
            NULLIF(rec->>'course_id', '')::UUID AS course_id,
            NULLIF(rec->>'faculty_id', '')::UUID AS faculty_id,
            NULLIF(rec->>'room_id', '')::UUID AS room_id,
            COALESCE(NULLIF(rec->>'quarter', ''), '')::VARCHAR(20) AS quarter,
            NULLIF(rec->>'day_pattern', '')::VARCHAR(10) AS day_pattern,
            NULLIF(rec->>'time_slot', '')::VARCHAR(20) AS time_slot,
            NULLIF(rec->>'section', '')::VARCHAR(10) AS section,
            NULLIF(rec->>'projected_enrollment', '')::INTEGER AS projected_enrollment,
            COALESCE(NULLIF(rec->>'updated_by', '')::UUID, auth.uid()) AS updated_by,
            COALESCE(NULLIF(rec->>'updated_at', '')::TIMESTAMPTZ, NOW()) AS updated_at
        FROM jsonb_array_elements(COALESCE(p_records, '[]'::JSONB)) WITH ORDINALITY AS t(rec, ord)
    ),
    normalized AS (
        SELECT
            academic_year_id,
            course_id,
            faculty_id,
            room_id,
            quarter,
            day_pattern,
            time_slot,
            section,
            projected_enrollment,
            updated_by,
            updated_at,
            CONCAT_WS(
                '|',
                academic_year_id::TEXT,
                COALESCE(course_id::TEXT, ''),
                LOWER(COALESCE(quarter, '')),
                UPPER(COALESCE(day_pattern, '')),
                COALESCE(time_slot, ''),
                UPPER(COALESCE(section, ''))
            ) AS sync_key,
            ordinal
        FROM parsed
        WHERE quarter <> ''
    )
    SELECT
        academic_year_id,
        course_id,
        faculty_id,
        room_id,
        quarter,
        day_pattern,
        time_slot,
        section,
        projected_enrollment,
        updated_by,
        updated_at,
        sync_key,
        ROW_NUMBER() OVER (PARTITION BY sync_key ORDER BY ordinal) AS row_rank
    FROM normalized;

    DROP TABLE IF EXISTS _existing_schedule_sync;
    CREATE TEMP TABLE _existing_schedule_sync (
        id UUID PRIMARY KEY,
        sync_key TEXT NOT NULL,
        row_rank INTEGER NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO _existing_schedule_sync (id, sync_key, row_rank)
    WITH ranked_existing AS (
        SELECT
            sc.id,
            CONCAT_WS(
                '|',
                sc.academic_year_id::TEXT,
                COALESCE(sc.course_id::TEXT, ''),
                LOWER(COALESCE(sc.quarter, '')),
                UPPER(COALESCE(sc.day_pattern, '')),
                COALESCE(sc.time_slot, ''),
                UPPER(COALESCE(sc.section, ''))
            ) AS sync_key,
            ROW_NUMBER() OVER (
                PARTITION BY CONCAT_WS(
                    '|',
                    sc.academic_year_id::TEXT,
                    COALESCE(sc.course_id::TEXT, ''),
                    LOWER(COALESCE(sc.quarter, '')),
                    UPPER(COALESCE(sc.day_pattern, '')),
                    COALESCE(sc.time_slot, ''),
                    UPPER(COALESCE(sc.section, ''))
                )
                ORDER BY sc.id
            ) AS row_rank
        FROM scheduled_courses sc
        WHERE sc.academic_year_id = p_academic_year_id
    )
    SELECT id, sync_key, row_rank
    FROM ranked_existing;

    UPDATE scheduled_courses sc
    SET
        course_id = src.course_id,
        faculty_id = src.faculty_id,
        room_id = src.room_id,
        quarter = src.quarter,
        day_pattern = src.day_pattern,
        time_slot = src.time_slot,
        section = src.section,
        projected_enrollment = src.projected_enrollment,
        updated_by = src.updated_by,
        updated_at = src.updated_at
    FROM _existing_schedule_sync existing
    JOIN _incoming_schedule_sync src
      ON src.sync_key = existing.sync_key
     AND src.row_rank = existing.row_rank
    WHERE sc.id = existing.id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    INSERT INTO scheduled_courses (
        academic_year_id,
        course_id,
        faculty_id,
        room_id,
        quarter,
        day_pattern,
        time_slot,
        section,
        projected_enrollment,
        updated_by,
        updated_at
    )
    SELECT
        src.academic_year_id,
        src.course_id,
        src.faculty_id,
        src.room_id,
        src.quarter,
        src.day_pattern,
        src.time_slot,
        src.section,
        src.projected_enrollment,
        src.updated_by,
        src.updated_at
    FROM _incoming_schedule_sync src
    LEFT JOIN _existing_schedule_sync existing
      ON existing.sync_key = src.sync_key
     AND existing.row_rank = src.row_rank
    WHERE existing.id IS NULL;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    DELETE FROM scheduled_courses sc
    USING _existing_schedule_sync existing
    WHERE sc.id = existing.id
      AND NOT EXISTS (
        SELECT 1
        FROM _incoming_schedule_sync src
        WHERE src.sync_key = existing.sync_key
          AND src.row_rank = existing.row_rank
      );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    RETURN QUERY
    SELECT v_updated, v_inserted, v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_scheduled_courses_for_academic_year(UUID, JSONB)
TO anon, authenticated, service_role;
