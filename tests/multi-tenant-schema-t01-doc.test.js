const fs = require('fs');
const path = require('path');

function loadDoc() {
    const filePath = path.resolve(__dirname, '..', 'docs', 'multi-tenant-schema-t01.md');
    return fs.readFileSync(filePath, 'utf8');
}

describe('T-01 schema design doc contract', () => {
    test('documents programs table shape and table inventory', () => {
        const doc = loadDoc();
        expect(doc).toContain('create table if not exists public.programs');
        expect(doc).toContain('Program-Scoped Table Inventory');
        expect(doc).toContain('scheduled_courses');
        expect(doc).toContain('pathway_courses');
    });

    test('records current-program decision and policy model', () => {
        const doc = loadDoc();
        expect(doc).toContain('Current program context source');
        expect(doc).toContain('Option A (JWT claim)');
        expect(doc).toContain('create or replace function public.current_program()');
        expect(doc).toContain('using (public.is_platform_admin() or program_id = public.current_program())');
    });

    test('includes checklist for acceptance tracking', () => {
        const doc = loadDoc();
        expect(doc).toContain('## Review Checklist');
        expect(doc).toContain('programs` table shape defined');
        expect(doc).toContain('Schema diagram and migration plan included');
    });
});
