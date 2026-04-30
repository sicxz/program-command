const fs = require('fs');
const path = require('path');

function loadSql() {
    return fs.readFileSync(
        path.resolve(__dirname, '..', 'scripts', 'supabase-sync-course-catalog.sql'),
        'utf8'
    );
}

describe('course catalog Supabase sync script', () => {
    test('updates existing DESN courses from the canonical catalog without replacing rows', () => {
        const sql = loadSql();

        expect(sql).toMatch(/UPDATE public\.courses c/i);
        expect(sql).toMatch(/JOIN public\.departments d/i);
        expect(sql).toMatch(/WHERE d\.code = 'DESN'/i);
        expect(sql).toMatch(/c\.code = canonical_courses\.code/i);
        expect(sql).not.toMatch(/DELETE FROM public\.courses/i);
        expect(sql).not.toMatch(/TRUNCATE/i);
    });

    test('contains current public-schedule course titles that were stale in Supabase', () => {
        const sql = loadSql();

        expect(sql).toContain("('DESN 368', 'Code + Design 1', 5, 24, '300')");
        expect(sql).toContain("('DESN 369', 'Web Development 1', 5, 24, '300')");
        expect(sql).toContain("('DESN 379', 'Web Development 2', 5, 24, '300')");
        expect(sql).toContain("('DESN 491', 'Senior Project', 5, 10, '400')");
    });

    test('ends with a mismatch verification query', () => {
        const sql = loadSql();

        expect(sql).toMatch(/SELECT\s+c\.code,\s+c\.title AS current_title,\s+canonical_courses\.title AS canonical_title/is);
        expect(sql).toMatch(/ORDER BY c\.code/i);
        expect(sql).toMatch(/COMMIT;/i);
    });
});
