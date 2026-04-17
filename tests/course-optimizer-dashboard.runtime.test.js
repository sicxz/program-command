const {
    resolvePreferredAcademicYear,
    calculateHealthScore,
    getHealthRating
} = require('../pages/course-optimizer-dashboard.js');

describe('course optimizer dashboard runtime helpers', () => {
    test('selects the requested academic year when present', () => {
        expect(resolvePreferredAcademicYear([
            { year: '2025-26', id: 'ay-1', is_active: false },
            { year: '2026-27', id: 'ay-2', is_active: true }
        ], '2025-26')).toEqual({ year: '2025-26', id: 'ay-1', is_active: false });
    });

    test('scores healthy courses above struggling ones', () => {
        const strongScore = calculateHealthScore({
            average: 22,
            trend: 'growing',
            sections: 6
        });
        const weakScore = calculateHealthScore({
            average: 7,
            trend: 'declining',
            sections: 1
        });

        expect(strongScore).toBeGreaterThan(weakScore);
        expect(getHealthRating(strongScore)).toMatch(/excellent|good/);
        expect(getHealthRating(weakScore)).toMatch(/fair|poor|critical/);
    });
});
