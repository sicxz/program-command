const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const catalogPath = path.join(repoRoot, 'data', 'course-catalog.json');
const courseIndexPath = path.join(repoRoot, 'ewu-design-catalog', 'COURSE-INDEX.md');

function parseCatalogIndex(markdown) {
    const byLevelSection = markdown.split('## By Track')[0];

    return byLevelSection
        .split(/\r?\n/)
        .map((line) => line.match(/^- \*\*(DESN-\d{3})\*\*\s+(.+?)(?:\s+\(([^)]*)\))?(?:\s+\*\[.*)?$/))
        .filter(Boolean)
        .map((match) => ({
            code: match[1].replace('-', ' '),
            title: String(match[2] || '').trim()
        }));
}

describe('course catalog sync', () => {
    test('fallback JSON course codes and titles match COURSE-INDEX.md', () => {
        const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
        const indexMarkdown = fs.readFileSync(courseIndexPath, 'utf8');

        const indexCourses = parseCatalogIndex(indexMarkdown);
        const catalogCourses = (catalog.courses || []).map((course) => ({
            code: String(course.code || '').trim(),
            title: String(course.title || '').trim()
        }));

        expect(catalogCourses).toEqual(indexCourses);
    });
});
