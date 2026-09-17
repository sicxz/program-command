const fs = require('fs');
const path = require('path');
const SectionRegistrations = require('../js/section-registrations.js');

const snapshots = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'data', 'enrollment-registration-snapshots.json'),
    'utf8'
));
const fallSections = SectionRegistrations.forTerm(snapshots, '2026-27', 'fall');

describe('section registrations', () => {
    test('matches the Fall 2026 DESN 100 section by course, days, and time', () => {
        expect(SectionRegistrations.match(fallSections, {
            course: 'DESN 100',
            days: 'MW',
            startTime: '16:00',
            endTime: '18:20'
        })).toMatchObject({ crn: '40436', enrolled: 22 });
    });

    test('returns null when a scheduled section has no snapshot counterpart', () => {
        expect(SectionRegistrations.match(fallSections, {
            course: 'DESN 200',
            days: 'MW',
            startTime: '10:00'
        })).toBeNull();
    });

    test('reports registrations above the section cap as overload', () => {
        expect(SectionRegistrations.status(23, 20)).toEqual({
            enrolled: 23,
            cap: 20,
            over: 3,
            overload: true
        });
    });

    test('does not flag registrations at or below the section cap', () => {
        expect(SectionRegistrations.status(14, 20)).toEqual({
            enrolled: 14,
            cap: 20,
            over: 0,
            overload: false
        });
    });
});
