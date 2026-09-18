const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractFunction(source, name) {
    const marker = `function ${name}(`;
    const start = source.indexOf(marker);
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
    const registrations = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'section-registrations.js'), 'utf8');
    const sandbox = {
        currentAcademicYear: '2026-27',
        registrationSnapshots: {
            terms: [{
                academicYear: '2026-27',
                quarter: 'fall',
                sections: [
                    {
                        course: 'DESN 216',
                        section: '001',
                        meeting: { days: 'MW', beginTime: '1300', endTime: '1520' }
                    },
                    {
                        course: 'DESN 216',
                        section: '025',
                        meeting: { arranged: true }
                    },
                    {
                        course: 'DESN 463',
                        section: '001',
                        meeting: { days: 'MW', beginTime: '1300', endTime: '1520' }
                    }
                ]
            }]
        }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(registrations, sandbox);
    vm.runInContext(extractFunction(html, 'resolveSectionNumber'), sandbox);
    return { html, sandbox };
}

describe('Program Command section numbers', () => {
    let html;
    let harness;

    beforeEach(() => {
        ({ html, sandbox: harness } = createHarness());
    });

    test('uses Banner section 001 for the scheduled DESN 216 meeting', () => {
        expect(harness.resolveSectionNumber({
            code: 'DESN 216',
            day: 'MW',
            time: '13:00-15:20'
        }, 'fall')).toBe('001');
    });

    test('uses Banner section 025 for online DESN 216', () => {
        expect(harness.resolveSectionNumber({
            code: 'DESN 216',
            day: 'ONLINE',
            time: 'async'
        }, 'fall')).toBe('025');
    });

    test('lets a Banner match replace a stored section', () => {
        expect(harness.resolveSectionNumber({
            code: 'DESN 463',
            day: 'MW',
            time: '13:00-15:20',
            section: '008'
        }, 'fall')).toBe('001');
    });

    test('defaults an unmatched course without a stored section to 001', () => {
        expect(harness.resolveSectionNumber({
            code: 'DESN 999',
            day: 'TR',
            time: '09:00-11:20',
            section: ''
        }, 'fall')).toBe('001');
    });

    test('keeps a typed section for an unmatched course', () => {
        expect(harness.resolveSectionNumber({
            code: 'DESN 999',
            day: 'TR',
            time: '09:00-11:20',
            section: '003'
        }, 'fall')).toBe('003');
    });

    test('defaults to 001 when registration snapshots are unavailable', () => {
        harness.registrationSnapshots = null;
        expect(harness.resolveSectionNumber({
            code: 'DESN 999',
            day: 'TR',
            time: '09:00-11:20',
            section: ''
        }, 'fall')).toBe('001');
    });

    test('supplies snapshot loop meeting fields so Banner replaces a stale raw section', () => {
        const rawCourse = { code: 'DESN 216', section: '012' };

        expect(harness.resolveSectionNumber({
            ...rawCourse,
            day: 'ONLINE',
            time: 'async'
        }, 'fall')).toBe('025');
        expect(html).toContain('section: resolveSectionNumber({ ...course, day, time }, quarter)');
    });

    test('does not derive section numbers from list position', () => {
        expect(html).not.toContain("String(index + 1).padStart(3, '0')");
    });

    test('the helper reads the window copy that the module script publishes', () => {
        expect(html).toContain('window.registrationSnapshots = registrationSnapshots;');
        expect(html).toContain('window.registrationSnapshots = null;');
        expect(extractFunction(html, 'resolveSectionNumber')).toContain('window.registrationSnapshots');
        expect(extractFunction(html, 'resolveSectionNumber')).not.toMatch(/forTerm\(registrationSnapshots/);
    });
});
