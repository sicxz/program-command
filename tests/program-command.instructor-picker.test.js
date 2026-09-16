const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractFunction(source, name) {
    const asyncMarker = `async function ${name}(`;
    const marker = `function ${name}(`;
    const start = source.indexOf(asyncMarker) >= 0
        ? source.indexOf(asyncMarker)
        : source.indexOf(marker);
    if (start < 0) throw new Error(`Could not find ${name}`);

    const bodyStart = source.indexOf('{', start);
    let depth = 0;
    for (let index = bodyStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`Could not find the end of ${name}`);
}

function createHarness() {
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'program-command.html'), 'utf8');
    const sandbox = {
        console: { warn: jest.fn() }
    };
    vm.createContext(sandbox);
    vm.runInContext(extractFunction(html, 'getInstructorPickerNames'), sandbox);
    vm.runInContext(extractFunction(html, 'buildInstructorPickerOptions'), sandbox);
    return sandbox;
}

function scheduleWith(assignments = {}) {
    const schedule = {};
    Object.entries(assignments).forEach(([quarter, instructors]) => {
        schedule[quarter] = {
            MW: {
                '10:00-12:20': instructors.map(instructor => ({ instructor }))
            }
        };
    });
    return schedule;
}

describe('Program Command instructor picker', () => {
    let harness;

    beforeEach(() => {
        harness = createHarness();
    });

    test('includes whole-year appointments and resolves the academic-year id', async () => {
        const service = {
            getAcademicYears: jest.fn().mockResolvedValue([{ id: 'year-26', year: '2025-26' }]),
            getRoster: jest.fn().mockResolvedValue([
                { quarter: null, end_date: null, faculty: { name: 'A.Adams', category: 'fullTime' } }
            ])
        };

        const result = await harness.buildInstructorPickerOptions('2025-26', 'fall', {}, service);

        expect(service.getRoster).toHaveBeenCalledWith('year-26');
        expect(Array.from(result.names)).toContain('A.Adams');
        expect(result.fallback).toBe(false);
    });

    test('includes adjuncts only in their appointment quarter', () => {
        const roster = [
            { category: 'adjunct', quarter: 'winter', faculty: { name: 'W.Winter' } },
            { category: 'adjunct', quarter: 'spring', faculty: { name: 'S.Spring' } }
        ];

        const winter = Array.from(harness.getInstructorPickerNames(roster, 'winter', {}, false));
        const fall = Array.from(harness.getInstructorPickerNames(roster, 'fall', {}, false));

        expect(winter).toContain('W.Winter');
        expect(winter).not.toContain('S.Spring');
        expect(fall).not.toContain('W.Winter');
        expect(fall).not.toContain('S.Spring');
    });

    test('excludes ended appointments unless the name is assigned in the quarter', () => {
        const roster = [
            { category: 'fullTime', quarter: null, end_date: '2026-06-01', faculty: { name: 'H.History' } },
            { category: 'fullTime', quarter: null, end_date: '2026-06-01', faculty: { name: 'E.Ended' } }
        ];
        const schedule = scheduleWith({ fall: ['H.History'] });

        const names = Array.from(harness.getInstructorPickerNames(roster, 'fall', schedule, false));

        expect(names).toContain('H.History');
        expect(names).not.toContain('E.Ended');
    });

    test('keeps a historical assigned name that is absent from the roster', () => {
        const roster = [
            { category: 'fullTime', quarter: null, end_date: null, faculty: { name: 'A.Active' } }
        ];
        const schedule = scheduleWith({ fall: ['F.Fall'], spring: ['F.Former'] });

        const names = Array.from(harness.getInstructorPickerNames(roster, 'spring', schedule, false));

        expect(names).toEqual(expect.arrayContaining(['A.Active', 'F.Former']));
        expect(names).not.toContain('F.Fall');
    });

    test('always includes placeholders and returns de-duplicated sorted names', () => {
        const roster = [
            { category: 'fullTime', quarter: null, faculty: { name: 'B.Brown' } },
            { category: 'fullTime', quarter: null, faculty: { name: 'B.Brown' } },
            { category: 'fullTime', quarter: null, faculty: { name: 'A.Adams' } }
        ];

        const names = Array.from(harness.getInstructorPickerNames(roster, 'fall', {}, false));

        expect(names).toEqual(['A.Adams', 'Adjunct', 'B.Brown', 'TBD']);
    });

    test('falls back to assigned names across the year when the roster is empty', async () => {
        const service = {
            getAcademicYears: jest.fn().mockResolvedValue([{ id: 'year-26', year: '2025-26' }]),
            getRoster: jest.fn().mockResolvedValue([])
        };
        const schedule = scheduleWith({ fall: ['F.Fall'], spring: ['S.Spring'] });

        const result = await harness.buildInstructorPickerOptions('2025-26', 'winter', schedule, service);

        expect(Array.from(result.names)).toEqual(['Adjunct', 'F.Fall', 'S.Spring', 'TBD']);
        expect(result.fallback).toBe(true);
        expect(harness.console.warn).toHaveBeenCalledTimes(1);
    });

    test('falls back to assigned names and warns once when getRoster fails', async () => {
        const service = {
            getAcademicYears: jest.fn().mockResolvedValue([{ id: 'year-26', year: '2025-26' }]),
            getRoster: jest.fn().mockRejectedValue(new Error('offline'))
        };
        const schedule = scheduleWith({ fall: ['F.Fall'], spring: ['S.Spring'] });

        const result = await harness.buildInstructorPickerOptions('2025-26', 'fall', schedule, service);

        expect(Array.from(result.names)).toEqual(['Adjunct', 'F.Fall', 'S.Spring', 'TBD']);
        expect(result.fallback).toBe(true);
        expect(harness.console.warn).toHaveBeenCalledTimes(1);
    });
});
