const fs = require('fs');
const path = require('path');

function loadMigrationSql() {
    const filePath = path.resolve(__dirname, '..', 'scripts', 'supabase-program-rls-t03.sql');
    return fs.readFileSync(filePath, 'utf8');
}

describe('T-03 program RLS migration contract', () => {
    test('requires current_program dependency and program_id columns', () => {
        const sql = loadMigrationSql();
        expect(sql).toMatch(/to_regprocedure\('public\.current_program\(\)'\)/i);
        expect(sql).toMatch(/column_name = 'program_id'/i);
        expect(sql).toMatch(/Run T-04 migration first/i);
        expect(sql).toMatch(/Run T-02 migration first/i);
    });

    test('defines platform admin bypass with current_program scoping', () => {
        const sql = loadMigrationSql();
        expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.is_platform_admin\(\)/i);
        expect(sql).toMatch(/public\.is_platform_admin\(\) OR program_id = public\.current_program\(\)/i);
    });

    test('creates four t03 policies per scoped table and drops existing policies first', () => {
        const sql = loadMigrationSql();
        expect(sql).toMatch(/DROP POLICY IF EXISTS %I ON public\.%I/i);
        expect(sql).toMatch(/CREATE POLICY %I ON public\.%I FOR SELECT/i);
        expect(sql).toMatch(/CREATE POLICY %I ON public\.%I FOR INSERT/i);
        expect(sql).toMatch(/CREATE POLICY %I ON public\.%I FOR UPDATE/i);
        expect(sql).toMatch(/CREATE POLICY %I ON public\.%I FOR DELETE/i);
    });
});
