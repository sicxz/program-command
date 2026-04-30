const fs = require('fs');
const path = require('path');

function loadMigrationSql() {
    const filePath = path.resolve(__dirname, '..', 'scripts', 'supabase-public-schedule-read.sql');
    return fs.readFileSync(filePath, 'utf8');
}

describe('public schedule read migration contract', () => {
    test('defines a security definer RPC allowlisted to AY 2026-27 Design', () => {
        const sql = loadMigrationSql();

        expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_public_schedule/i);
        expect(sql).toMatch(/p_academic_year TEXT DEFAULT '2026-27'/i);
        expect(sql).toMatch(/p_program_code TEXT DEFAULT 'ewu-design'/i);
        expect(sql).toMatch(/SECURITY DEFINER/i);
        expect(sql).toMatch(/v_academic_year <> '2026-27'/i);
        expect(sql).toMatch(/v_program_code <> 'ewu-design'/i);
    });

    test('returns only schedule display fields without audit or identifier columns', () => {
        const sql = loadMigrationSql();

        expect(sql).toMatch(/RETURNS TABLE \(/i);
        expect(sql).toMatch(/academic_year TEXT/i);
        expect(sql).toMatch(/course_code TEXT/i);
        expect(sql).toMatch(/instructor_name TEXT/i);
        expect(sql).toMatch(/room_code TEXT/i);
        expect(sql).not.toMatch(/\bid UUID\b/i);
        expect(sql).not.toMatch(/\bupdated_by\b/i);
        expect(sql).not.toMatch(/\bcreated_by\b/i);
        expect(sql).not.toMatch(/\bconfig JSONB\b/i);
    });

    test('grants anonymous execute only and does not grant anon table access', () => {
        const sql = loadMigrationSql();

        expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_public_schedule\(TEXT, TEXT, TEXT\) FROM PUBLIC/i);
        expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_public_schedule\(TEXT, TEXT, TEXT\)\s+TO anon, authenticated, service_role/i);
        expect(sql).not.toMatch(/GRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL).*TO\s+anon/i);
        expect(sql).not.toMatch(/CREATE POLICY .* TO anon/i);
    });

    test('keeps the tenantized query scoped through program and academic year', () => {
        const sql = loadMigrationSql();

        expect(sql).toMatch(/information_schema\.columns/i);
        expect(sql).toMatch(/v_has_program_scope/i);
        expect(sql).toMatch(/JOIN public\.programs p/i);
        expect(sql).toMatch(/p\.code = v_program_code/i);
        expect(sql).toMatch(/ay\.year = v_academic_year/i);
        expect(sql).toMatch(/ay\.program_id = sc\.program_id/i);
        expect(sql).toMatch(/c\.program_id = sc\.program_id/i);
        expect(sql).toMatch(/f\.program_id = sc\.program_id/i);
        expect(sql).toMatch(/r\.program_id = sc\.program_id/i);
    });

    test('falls back to the legacy department schema used by current production', () => {
        const sql = loadMigrationSql();

        expect(sql).toMatch(/IF NOT v_has_program_scope THEN/i);
        expect(sql).toMatch(/v_department_code := 'DESN'/i);
        expect(sql).toMatch(/JOIN public\.departments d/i);
        expect(sql).toMatch(/d\.id = ay\.department_id/i);
        expect(sql).toMatch(/d\.code = v_department_code/i);
        expect(sql).toMatch(/c\.department_id = d\.id/i);
        expect(sql).toMatch(/f\.department_id = d\.id/i);
        expect(sql).toMatch(/r\.department_id = d\.id/i);
    });
});
