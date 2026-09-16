const fs = require('fs');
const path = require('path');
const DefaultTerm = require('../js/default-term.js');

const calendar = {
    terms: [
        { quarter: 'fall', year: 2025, start: '2025-09-24', end: '2025-12-11' },
        { quarter: 'winter', year: 2026, start: '2026-01-05', end: '2026-03-20' },
        { quarter: 'spring', year: 2026, start: '2026-03-30', end: '2026-06-11' },
        { quarter: 'summer', year: 2026, start: '2026-06-22', end: '2026-08-14' },
        { quarter: 'fall', year: 2026, start: '2026-09-23', end: '2026-12-10' }
    ]
};

describe('DefaultTerm.resolve', () => {
    test('uses a valid pinned setting before the calendar', () => {
        expect(DefaultTerm.resolve({
            pinned: { academicYear: '2026-27', quarter: 'WINTER' },
            calendar,
            now: new Date('2026-10-15T12:00:00Z'),
            allowSummer: false
        })).toEqual({ academicYear: '2026-27', quarter: 'winter', source: 'setting' });
    });

    test('resolves a date inside Fall 2026 from the calendar', () => {
        expect(DefaultTerm.resolve({
            pinned: null,
            calendar,
            now: new Date('2026-10-15T12:00:00Z'),
            allowSummer: false
        })).toEqual({ academicYear: '2026-27', quarter: 'fall', source: 'calendar' });
    });

    test('uses an upcoming term when a date between terms is within 60 days', () => {
        expect(DefaultTerm.resolve({
            pinned: null,
            calendar,
            now: new Date('2026-03-25T12:00:00Z'),
            allowSummer: false
        })).toEqual({ academicYear: '2025-26', quarter: 'spring', source: 'calendar' });
    });

    test('moves calendar summer to next academic year fall when summer is unavailable', () => {
        const now = new Date('2026-07-15T12:00:00Z');
        expect(DefaultTerm.resolve({ pinned: null, calendar, now, allowSummer: false }))
            .toEqual({ academicYear: '2026-27', quarter: 'fall', source: 'calendar' });
        expect(DefaultTerm.resolve({ pinned: null, calendar, now, allowSummer: true }))
            .toEqual({ academicYear: '2025-26', quarter: 'summer', source: 'calendar' });
    });

    test('derives a fallback term from the supplied date when no calendar is available', () => {
        expect(DefaultTerm.resolve({
            pinned: null,
            calendar: null,
            now: new Date('2026-02-15T12:00:00Z'),
            allowSummer: true
        })).toEqual({ academicYear: '2025-26', quarter: 'winter', source: 'fallback' });
    });

    test('does not throw for malformed input and falls through to a fixed-date fallback', () => {
        const resolveMalformed = () => DefaultTerm.resolve({
            pinned: { academicYear: 'not-a-year', quarter: 'monsoon' },
            calendar: { terms: [{ quarter: null, start: 3, end: [] }] },
            now: new Date('2026-05-15T12:00:00Z'),
            allowSummer: false
        });
        expect(resolveMalformed).not.toThrow();
        expect(resolveMalformed()).toEqual({
            academicYear: '2025-26', quarter: 'spring', source: 'fallback'
        });
    });

    test('Program Command and quarter navigation no longer contain their old initial literals', () => {
        const root = path.resolve(__dirname, '..');
        const programCommand = fs.readFileSync(path.join(root, 'program-command.html'), 'utf8');
        const quarterNav = fs.readFileSync(path.join(root, 'js/components/quarter-nav.js'), 'utf8');
        expect(programCommand).not.toContain("currentAcademicYear = '2025-26'");
        expect(programCommand).toContain('js/default-term.js');
        expect(quarterNav).not.toContain("this.currentQuarter = 'spring'");
    });
});
