const {
    canonicalFacultyKey,
    findFacultyByName
} = require('../js/faculty-utils.js');

const facultyRows = [
    { id: 'mills-long', name: 'Simeon Mills' },
    { id: 'mills-short', name: 'S.Mills' },
    { id: 'masingale-long', name: 'Travis Masingale' },
    { id: 'masingale-compact', name: 'T.Masingale' },
    { id: 'masingale-spaced', name: 'T. Masingale' },
    { id: 'manikoth-long', name: 'Colin Manikoth' },
    { id: 'manikoth-short', name: 'C.Manikoth' },
    { id: 'manikoth-last', name: 'Manikoth' },
    { id: 'compound', name: 'Barton/Pettigrew' },
    { id: 'barton', name: 'Barton' },
    { id: 'pettigrew', name: 'Pettigrew' }
];

describe('canonicalFacultyKey', () => {
    test.each([
        ['T. Masingale', 'masingale|t'],
        ['T.Masingale', 'masingale|t'],
        ['Travis Masingale', 'masingale|t'],
        ['Masingale, Travis', 'masingale|t'],
        ['Masingale', 'masingale|'],
        ['C.Manikoth', 'manikoth|c']
    ])('canonicalizes %s', (name, expected) => {
        expect(canonicalFacultyKey(name)).toBe(expected);
    });

    test('keeps a compound last name distinct from either component', () => {
        expect(canonicalFacultyKey('Barton/Pettigrew')).toBe('barton/pettigrew|');
        expect(canonicalFacultyKey('Barton/Pettigrew')).not.toBe(canonicalFacultyKey('Barton'));
        expect(canonicalFacultyKey('Barton/Pettigrew')).not.toBe(canonicalFacultyKey('Pettigrew'));
    });
});

describe('findFacultyByName', () => {
    test('prefers an exact name match among duplicate representations', () => {
        expect(findFacultyByName(facultyRows, 'T. Masingale')).toBe(facultyRows[4]);
    });

    test('matches equivalent names when both names provide the same initial', () => {
        expect(findFacultyByName(facultyRows, 'S. Mills')).toBe(facultyRows[0]);
        expect(findFacultyByName(facultyRows, 'C. Manikoth')).toEqual(
            expect.objectContaining({ name: expect.stringMatching(/Manikoth$/) })
        );
        expect(canonicalFacultyKey(findFacultyByName(facultyRows, 'C. Manikoth').name))
            .toBe('manikoth|c');
    });

    test('prefers the exact last-name-only Manikoth row', () => {
        expect(findFacultyByName(facultyRows, 'Manikoth')).toBe(facultyRows[7]);
    });

    test('matches a last-name-only lookup when exactly one candidate exists', () => {
        const rows = [{ id: 'only', name: 'Quinn Newperson' }];
        expect(findFacultyByName(rows, 'Newperson')).toBe(rows[0]);
    });

    test('does not guess from a last name shared by multiple rows', () => {
        expect(findFacultyByName(facultyRows, 'Masingale')).toBeNull();
    });

    test('never matches a compound name to either last name alone', () => {
        const compoundOnly = [facultyRows[8]];
        expect(findFacultyByName(compoundOnly, 'Barton')).toBeNull();
        expect(findFacultyByName(compoundOnly, 'Pettigrew')).toBeNull();
    });

    test('returns null rather than matching different initials', () => {
        expect(findFacultyByName([{ name: 'Travis Masingale' }], 'Q.Masingale')).toBeNull();
    });
});
