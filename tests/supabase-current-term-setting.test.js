const fs = require('fs');
const path = require('path');

function loadMigrationSql() {
    const filePath = path.resolve(__dirname, '..', 'scripts', 'supabase-current-term-setting.sql');
    return fs.readFileSync(filePath, 'utf8');
}

describe('public default term migration contract', () => {
    test('creates the settings table with a program_code key and RLS enabled', () => {
        const sql = loadMigrationSql();
        expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.public_schedule_settings/i);
        expect(sql).toMatch(/program_code TEXT PRIMARY KEY/i);
        expect(sql).toMatch(/ALTER TABLE public\.public_schedule_settings ENABLE ROW LEVEL SECURITY/i);
    });

    test('seeds the EWU Design default without clobbering an existing row', () => {
        const sql = loadMigrationSql();
        expect(sql).toMatch(/INSERT INTO public\.public_schedule_settings/i);
        expect(sql).toMatch(/ON CONFLICT \(program_code\) DO NOTHING/i);
    });

    test('defines an anon-readable get_public_current_term with allowlist + fallback', () => {
        const sql = loadMigrationSql();
        expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_public_current_term\(/i);
        expect(sql).toMatch(/SECURITY DEFINER/i);
        expect(sql).toMatch(/RETURN QUERY SELECT '2026-27'::TEXT, 'fall'::TEXT/i);
        expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_public_current_term\(TEXT\)[\s\S]*?TO anon, authenticated, service_role/i);
    });

    test('defines an authenticated-only set_public_current_term that validates input', () => {
        const sql = loadMigrationSql();
        expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.set_public_current_term\(/i);
        expect(sql).toMatch(/auth\.uid\(\) IS NULL/i);
        expect(sql).toMatch(/is not in the public allowlist/i);
        expect(sql).toMatch(/ON CONFLICT \(program_code\) DO UPDATE/i);
        expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.set_public_current_term\(TEXT, TEXT, TEXT\)[\s\S]*?TO authenticated, service_role/i);
        // Write access must never be granted to anon.
        expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.set_public_current_term\(TEXT, TEXT, TEXT\)[\s\S]*?TO anon/i);
    });
});
