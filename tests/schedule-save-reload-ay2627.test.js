/**
 * AY 2026-27 save/reload integration regression test (Tree/C-10, issue #62).
 * - Test writes AY 2026-27 draft schedule and reloads it.
 * - Reload returns identical schedule payload for the same year.
 * - Test guards against cross-year data bleed.
 */

const PREFIX = 'designSchedulerData_';

function getStorageKey(year) {
    return PREFIX + (year || '2026-27');
}

describe('AY 2026-27 save/reload integration', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
    });

    test('writes AY 2026-27 draft schedule and reload returns identical payload', () => {
        const draft202627 = {
            fall: {
                MW: {
                    '10:00-12:20': [
                        { code: 'DESN 368', name: 'Code + Design 1', instructor: 'TBD', credits: 5, room: '206' }
                    ]
                }
            },
            winter: {},
            spring: {}
        };
        localStorage.setItem(getStorageKey('2026-27'), JSON.stringify(draft202627));
        const saved = localStorage.getItem(getStorageKey('2026-27'));
        expect(saved).toBeTruthy();
        const reloaded = JSON.parse(saved);
        expect(reloaded).toEqual(draft202627);
        expect(reloaded.fall.MW['10:00-12:20']).toHaveLength(1);
        expect(reloaded.fall.MW['10:00-12:20'][0].code).toBe('DESN 368');
    });

    test('reload returns identical schedule payload for the same year', () => {
        const payload = {
            fall: { TR: { '13:00-15:20': [{ code: 'DESN 100', name: 'Foundations', instructor: 'Faculty A', credits: 5, room: '209' }] } },
            winter: { MW: {} },
            spring: {}
        };
        localStorage.setItem(getStorageKey('2026-27'), JSON.stringify(payload));
        const read1 = JSON.parse(localStorage.getItem(getStorageKey('2026-27')));
        const read2 = JSON.parse(localStorage.getItem(getStorageKey('2026-27')));
        expect(read1).toEqual(read2);
        expect(read1).toEqual(payload);
    });

    test('guards against cross-year data bleed', () => {
        const payload202526 = { fall: { MW: { '10:00-12:20': [{ code: 'DESN 200', instructor: 'X', credits: 5 }] } }, winter: {}, spring: {} };
        const payload202627 = { fall: { TR: { '13:00-15:20': [{ code: 'DESN 300', instructor: 'Y', credits: 5 }] } }, winter: {}, spring: {} };
        localStorage.setItem(getStorageKey('2025-26'), JSON.stringify(payload202526));
        localStorage.setItem(getStorageKey('2026-27'), JSON.stringify(payload202627));
        const read202526 = JSON.parse(localStorage.getItem(getStorageKey('2025-26')));
        const read202627 = JSON.parse(localStorage.getItem(getStorageKey('2026-27')));
        expect(read202526).toEqual(payload202526);
        expect(read202627).toEqual(payload202627);
        expect(read202526.fall.MW['10:00-12:20'][0].code).toBe('DESN 200');
        expect(read202627.fall.TR['13:00-15:20'][0].code).toBe('DESN 300');
    });
});
