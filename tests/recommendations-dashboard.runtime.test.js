const { resolvePreferredAcademicYear } = require('../pages/recommendations-dashboard.js');

describe('recommendations dashboard runtime helpers', () => {
    test('prefers the active academic year', () => {
        expect(resolvePreferredAcademicYear([
            { year: '2025-26', id: 'ay-1', is_active: false },
            { year: '2026-27', id: 'ay-2', is_active: true }
        ])).toEqual({ year: '2026-27', id: 'ay-2', is_active: true });
    });

    test('falls back to the first available year when none are active', () => {
        expect(resolvePreferredAcademicYear([
            { year: '2025-26', id: 'ay-1', is_active: false },
            { year: '2024-25', id: 'ay-0', is_active: false }
        ])).toEqual({ year: '2025-26', id: 'ay-1', is_active: false });
    });
});
