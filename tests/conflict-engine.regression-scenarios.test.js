const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadScriptModule(relativePath) {
    const filePath = path.resolve(__dirname, '..', relativePath);
    const source = fs.readFileSync(filePath, 'utf8');

    const sandbox = {
        console,
        module: { exports: {} },
        exports: {}
    };

    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: relativePath });
    return sandbox.module.exports;
}

describe('ConflictEngine regression scenarios (real planning patterns)', () => {
    const ConflictEngine = loadScriptModule('js/conflict-engine.js');

    test('detects critical senior pathway conflict (DESN 463 + DESN 480) with valid recommendations', () => {
        const schedule = [
            { code: 'DESN 463', day: 'TR', time: '13:00-15:20', room: '206', instructor: 'T.Masingale' },
            { code: 'DESN 480', day: 'TR', time: '13:00-15:20', room: '207', instructor: 'C.Manikoth' },
            { code: 'DESN 200', day: 'MW', time: '10:00-12:20', room: '208', instructor: 'A.Sopu' }
        ];
        const constraints = [
            {
                id: 'student-pathway',
                enabled: true,
                constraint_type: 'student_conflict',
                rule_details: { severity: 'warning' }
            }
        ];

        const result = ConflictEngine.evaluate(schedule, constraints, {
            currentQuarter: 'spring',
            scheduleByQuarter: { fall: [], winter: [], spring: schedule }
        });

        expect(result.conflicts.length).toBeGreaterThan(0);
        const issue = result.conflicts.find((item) => item.type === 'student-conflict');
        expect(issue).toBeTruthy();
        expect(issue.severity).toBe('critical');
        expect(issue.currentSlot).toBe('TR 13:00-15:20');
        expect((issue.resolutions || []).length).toBeGreaterThan(0);
        expect(JSON.stringify(issue.resolutions)).not.toMatch(/10:00-12:00|13:00-15:00|16:00-18:00/);
    });

    test('does not reintroduce false positive for DESN 368 + DESN 490 co-scheduling', () => {
        const schedule = [
            { code: 'DESN 368', day: 'MW', time: '10:00-12:20', room: '206', instructor: 'T.Masingale' },
            { code: 'DESN 490', day: 'MW', time: '10:00-12:20', room: '209', instructor: 'C.Manikoth' }
        ];
        const constraints = [
            {
                id: 'student-pathway',
                enabled: true,
                constraint_type: 'student_conflict',
                rule_details: { severity: 'critical' }
            }
        ];

        const result = ConflictEngine.evaluate(schedule, constraints);
        expect(result.conflicts).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
    });

    test('faculty double-book suggestions stay on canonical scheduler slots', () => {
        const schedule = [
            { code: 'DESN 301', day: 'MW', time: '10:00-12:20', room: '206', instructor: 'S.Mills' },
            { code: 'DESN 401', day: 'MW', time: '10:00-12:20', room: '209', instructor: 'S.Mills' },
            { code: 'DESN 243', day: 'TR', time: '13:00-15:20', room: '210', instructor: 'S.Durr' }
        ];
        const constraints = [
            {
                id: 'faculty-double-book',
                enabled: true,
                constraint_type: 'faculty_double_book',
                rule_details: { severity: 'critical' }
            }
        ];

        const result = ConflictEngine.evaluate(schedule, constraints, {
            currentQuarter: 'fall',
            scheduleByQuarter: { fall: schedule, winter: [], spring: [] }
        });

        expect(result.conflicts.length).toBeGreaterThan(0);
        const issue = result.conflicts[0];
        expect(issue.title).toContain('Faculty Double-Booking');
        expect(JSON.stringify(issue.resolutions || [])).not.toMatch(/10:00-12:00|13:00-15:00|16:00-18:00/);
    });

    test('flags Spring 2026-style pathway conflicts for 401/463 and 365/468 pairs', () => {
        const schedule = [
            { code: 'DESN 401', day: 'MW', time: '10:00-12:20', room: '206', instructor: 'T.Masingale' },
            { code: 'DESN 463', day: 'MW', time: '10:00-12:20', room: '209', instructor: 'C.Manikoth' },
            { code: 'DESN 365', day: 'TR', time: '13:00-15:20', room: '210', instructor: 'S.Mills' },
            { code: 'DESN 468', day: 'TR', time: '13:00-15:20', room: '212', instructor: 'S.Durr' }
        ];
        const constraints = [
            {
                id: 'student-pathway',
                enabled: true,
                constraint_type: 'student_conflict',
                rule_details: { severity: 'warning' }
            }
        ];

        const result = ConflictEngine.evaluate(schedule, constraints, {
            currentQuarter: 'spring',
            scheduleByQuarter: { fall: [], winter: [], spring: schedule }
        });

        const allIssues = [...result.conflicts, ...result.warnings, ...result.suggestions];
        const has401463 = allIssues.some((issue) => {
            const codes = (issue.courses || []).map((course) => (typeof course === 'string' ? course : course.code));
            return codes.includes('DESN 401') && codes.includes('DESN 463');
        });
        const has365468 = allIssues.some((issue) => {
            const codes = (issue.courses || []).map((course) => (typeof course === 'string' ? course : course.code));
            return codes.includes('DESN 365') && codes.includes('DESN 468');
        });

        expect(has401463).toBe(true);
        expect(has365468).toBe(true);
    });

    test('ay setup alignment flags adjunct shortfall for planning targets', () => {
        const scheduleByQuarter = {
            fall: [
                { code: 'DESN 101', title: 'Design Lab', instructor: 'Adjunct', room: '212', day: 'TR', time: '16:00-18:20', credits: 5 }
            ],
            winter: [],
            spring: []
        };
        const constraints = [
            {
                id: 'ay-setup-alignment',
                enabled: true,
                constraint_type: 'ay_setup_alignment',
                rule_details: {}
            }
        ];
        const aySetupData = {
            adjunctTargets: { fall: 10, winter: 0, spring: 0 },
            faculty: [
                { name: 'T.Masingale', annualTargetCredits: 36, releaseCredits: 0 }
            ]
        };

        const result = ConflictEngine.evaluate(scheduleByQuarter.fall, constraints, {
            currentQuarter: 'fall',
            academicYear: '2026-27',
            scheduleByQuarter,
            aySetupData
        });

        const allIssues = [...result.conflicts, ...result.warnings];
        expect(allIssues.some((issue) => issue.title.includes('Fall Adjunct Shortfall'))).toBe(true);
    });
});
