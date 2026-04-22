const fs = require('fs');
const path = require('path');

function loadMigrationSql() {
    const filePath = path.resolve(__dirname, '..', 'scripts', 'supabase-current-program-helper-t04.sql');
    return fs.readFileSync(filePath, 'utf8');
}

describe('T-04 current_program migration contract', () => {
    test('creates user_programs mapping table and default-membership index', () => {
        const sql = loadMigrationSql();
        expect(sql).toMatch(/ALTER TABLE public\.programs ENABLE ROW LEVEL SECURITY/i);
        expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.user_programs/i);
        expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_user_programs_single_default/i);
    });

    test('defines STABLE current_program helper with JWT + fallback resolution', () => {
        const sql = loadMigrationSql();
        expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.current_program\(\)/i);
        expect(sql).toMatch(/RETURNS UUID/i);
        expect(sql).toMatch(/LANGUAGE sql\s+STABLE/i);
        expect(sql).toMatch(/public\.jwt_program_id\(\)/i);
        expect(sql).toMatch(/FROM public\.user_programs/i);
        expect(sql).toMatch(/WHERE up\.user_id = auth\.uid\(\)/i);
    });

    test('adds claim-sync trigger so app_metadata program_id stays aligned', () => {
        const sql = loadMigrationSql();
        expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.sync_user_program_claims\(/i);
        expect(sql).toMatch(/UPDATE auth\.users/i);
        expect(sql).toMatch(/DROP TRIGGER IF EXISTS trg_sync_user_program_claims ON public\.user_programs/i);
        expect(sql).toMatch(/CREATE TRIGGER trg_sync_user_program_claims/i);
    });

    test('adds scoped programs policies for config reads and admin-only writes', () => {
        const sql = loadMigrationSql();
        expect(sql).toMatch(/CREATE POLICY "programs_select_current_or_platform_admin"/i);
        expect(sql).toMatch(/id = public\.current_program\(\) OR public\.is_platform_admin\(\)/i);
        expect(sql).toMatch(/CREATE POLICY "programs_insert_platform_admin_only"/i);
        expect(sql).toMatch(/CREATE POLICY "programs_update_platform_admin_only"/i);
        expect(sql).toMatch(/CREATE POLICY "programs_delete_platform_admin_only"/i);
    });
});
