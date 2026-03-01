const fs = require('fs');
const path = require('path');

function loadSql(fileName) {
    const filePath = path.resolve(__dirname, '..', 'scripts', fileName);
    return fs.readFileSync(filePath, 'utf8');
}

describe('T-02 program_id migration contract', () => {
    test('forward migration creates programs table and seeds EWU Design tenant', () => {
        const sql = loadSql('supabase-program-id-migration-t02.sql');
        expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.programs/i);
        expect(sql).toMatch(/INSERT INTO public\.programs/i);
        expect(sql).toMatch(/VALUES \('EWU Design', 'ewu-design'/i);
        expect(sql).toMatch(/ON CONFLICT \(code\) DO UPDATE/i);
    });

    test('forward migration adds program_id columns, constraints, defaults, and indexes', () => {
        const sql = loadSql('supabase-program-id-migration-t02.sql');
        expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS program_id UUID/i);
        expect(sql).toMatch(/ALTER COLUMN program_id SET DEFAULT/i);
        expect(sql).toMatch(/ALTER COLUMN program_id SET NOT NULL/i);
        expect(sql).toMatch(/FOREIGN KEY \(program_id\) REFERENCES public\.programs\(id\)/i);
        expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_departments_program_id/i);
        expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_pathway_courses_program_id/i);
    });

    test('rollback script removes program_id artifacts and programs table', () => {
        const rollbackSql = loadSql('supabase-program-id-migration-t02-rollback.sql');
        expect(rollbackSql).toMatch(/DROP INDEX IF EXISTS public\.idx_departments_program_id/i);
        expect(rollbackSql).toMatch(/DROP CONSTRAINT IF EXISTS/i);
        expect(rollbackSql).toMatch(/ALTER TABLE public\..* DROP COLUMN IF EXISTS program_id/i);
        expect(rollbackSql).toMatch(/DROP TABLE IF EXISTS public\.programs/i);
    });
});
