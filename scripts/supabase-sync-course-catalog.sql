-- Sync EWU Design course catalog metadata from data/course-catalog.json.
-- Idempotent: updates existing DESN course rows without deleting or replacing IDs.

BEGIN;

CREATE TEMP TABLE canonical_course_catalog (
    code TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    default_credits INTEGER NOT NULL,
    typical_cap INTEGER NOT NULL,
    level TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO canonical_course_catalog (code, title, default_credits, typical_cap, level)
VALUES
    ('DESN 100', 'Drawing for Communication', 5, 24, '100'),
    ('DESN 200', 'Visual Thinking + Making', 5, 24, '200'),
    ('DESN 216', 'Digital Foundations', 5, 24, '200'),
    ('DESN 243', 'Typography', 5, 24, '200'),
    ('DESN 263', 'Visual Communication Design', 5, 24, '200'),
    ('DESN 213', 'Photoshop', 2, 24, '200'),
    ('DESN 214', 'Illustrator', 2, 24, '200'),
    ('DESN 215', 'InDesign', 2, 24, '200'),
    ('DESN 217', 'Figma', 2, 24, '200'),
    ('DESN 210', 'Design Lab', 2, 24, '200'),
    ('DESN 368', 'Code + Design 1', 5, 24, '300'),
    ('DESN 369', 'Web Development 1', 5, 24, '300'),
    ('DESN 378', 'Code + Design 2', 5, 24, '300'),
    ('DESN 379', 'Web Development 2', 5, 24, '300'),
    ('DESN 325', 'Emergent Design', 5, 24, '300'),
    ('DESN 374', 'AI + Design', 5, 24, '300'),
    ('DESN 326', 'Introduction to Animation', 5, 24, '300'),
    ('DESN 336', '3D Animation', 5, 24, '300'),
    ('DESN 355', 'Motion Design', 5, 24, '300'),
    ('DESN 365', 'Motion Design 2', 5, 24, '300'),
    ('DESN 338', 'User Experience Design 1', 5, 24, '300'),
    ('DESN 348', 'User Experience Design 2', 5, 24, '300'),
    ('DESN 301', 'Visual Storytelling', 5, 24, '300'),
    ('DESN 335', 'Board Game Design', 5, 24, '300'),
    ('DESN 345', 'Digital Game Design', 5, 24, '300'),
    ('DESN 343', 'Typography 2', 5, 24, '300'),
    ('DESN 360', 'Zine and Publication Design', 5, 24, '300'),
    ('DESN 350', 'Digital Photography', 5, 24, '300'),
    ('DESN 351', 'Advanced Photography', 5, 24, '300'),
    ('DESN 375', 'Digital Video', 5, 24, '300'),
    ('DESN 384', 'Digital Sound', 5, 24, '300'),
    ('DESN 359', 'Histories of Design', 5, 24, '300'),
    ('DESN 305', 'Social Media Design and Management', 5, 24, '300'),
    ('DESN 366', 'Production Design', 5, 24, '300'),
    ('DESN 396', 'Experimental Course', 5, 24, '300'),
    ('DESN 398', 'Seminar', 5, 24, '300'),
    ('DESN 399', 'Directed Study', 5, 5, '300'),
    ('DESN 468', 'Code + Design 3', 5, 24, '400'),
    ('DESN 469', 'Web Development 3', 5, 24, '400'),
    ('DESN 446', '4D Animation', 5, 24, '400'),
    ('DESN 458', 'User Experience Design 3', 5, 24, '400'),
    ('DESN 401', 'Imaginary Worlds', 5, 24, '400'),
    ('DESN 463', 'Community-Driven Design', 5, 24, '400'),
    ('DESN 480', 'Professional Practice', 5, 24, '400'),
    ('DESN 490', 'Senior Capstone', 5, 24, '400'),
    ('DESN 491', 'Senior Project', 5, 10, '400'),
    ('DESN 493', 'Portfolio Practice', 2, 24, '400'),
    ('DESN 495', 'Internship', 5, 15, '400'),
    ('DESN 496', 'Experimental', 5, 24, '400'),
    ('DESN 497', 'Workshop, Short Course, Conference, Seminar', 5, 24, '400'),
    ('DESN 498', 'Seminar', 5, 24, '400'),
    ('DESN 499', 'Directed Study', 5, 10, '400');

UPDATE public.courses c
SET
    title = canonical_courses.title,
    default_credits = canonical_courses.default_credits,
    typical_cap = canonical_courses.typical_cap,
    level = canonical_courses.level
FROM canonical_course_catalog canonical_courses,
     public.departments d
WHERE d.id = c.department_id
  AND d.code = 'DESN'
  AND c.code = canonical_courses.code
  AND (
      c.title IS DISTINCT FROM canonical_courses.title
      OR c.default_credits IS DISTINCT FROM canonical_courses.default_credits
      OR c.typical_cap IS DISTINCT FROM canonical_courses.typical_cap
      OR c.level IS DISTINCT FROM canonical_courses.level
  );

-- This should return zero rows after the update.
SELECT
    c.code,
    c.title AS current_title,
    canonical_courses.title AS canonical_title,
    c.default_credits AS current_credits,
    canonical_courses.default_credits AS canonical_credits,
    c.typical_cap AS current_cap,
    canonical_courses.typical_cap AS canonical_cap,
    c.level AS current_level,
    canonical_courses.level AS canonical_level
FROM public.courses c
JOIN public.departments d
  ON d.id = c.department_id
JOIN canonical_course_catalog canonical_courses
  ON canonical_courses.code = c.code
WHERE d.code = 'DESN'
  AND (
      c.title IS DISTINCT FROM canonical_courses.title
      OR c.default_credits IS DISTINCT FROM canonical_courses.default_credits
      OR c.typical_cap IS DISTINCT FROM canonical_courses.typical_cap
      OR c.level IS DISTINCT FROM canonical_courses.level
  )
ORDER BY c.code;

-- Existing rows are updated above. Missing rows are reported for review rather than
-- auto-inserted so scheduled_courses IDs and tenant columns stay untouched.
SELECT
    canonical_courses.code AS missing_code,
    canonical_courses.title AS missing_title
FROM canonical_course_catalog canonical_courses
CROSS JOIN public.departments d
LEFT JOIN public.courses c
  ON c.department_id = d.id
 AND c.code = canonical_courses.code
WHERE d.code = 'DESN'
  AND c.id IS NULL
ORDER BY canonical_courses.code;

COMMIT;
