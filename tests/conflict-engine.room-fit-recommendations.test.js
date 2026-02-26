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

describe('ConflictEngine room-fit recommendations', () => {
    const ConflictEngine = loadScriptModule('js/conflict-engine.js');

    test('filters slot recommendations when only room-rule-blocked rooms are available', () => {
        const schedule = [
            { code: 'DESN 200', day: 'MW', time: '10:00-12:20', room: '206', instructor: 'A.Sopu' },
            { code: 'DESN 243', day: 'MW', time: '10:00-12:20', room: '207', instructor: 'S.Durr' },
            { code: 'DESN 301', day: 'TR', time: '16:00-18:20', room: '206', instructor: 'T.Masingale' },
            { code: 'DESN 338', day: 'TR', time: '16:00-18:20', room: '207', instructor: 'M.Lybbert' },
            { code: 'DESN 355', day: 'TR', time: '16:00-18:20', room: '208', instructor: 'G.Hustrulid' },
            { code: 'DESN 365', day: 'TR', time: '16:00-18:20', room: '209', instructor: 'C.Manikoth' },
            { code: 'DESN 368', day: 'TR', time: '16:00-18:20', room: '210', instructor: 'S.Mills' }
        ];
        const constraints = [
            {
                id: 'student-pathway',
                enabled: true,
                constraint_type: 'student_conflict',
                rule_details: { severity: 'critical' }
            },
            {
                id: 'room-212-restriction',
                enabled: true,
                constraint_type: 'room_restriction',
                rule_details: {
                    room: '212',
                    allowed_courses: ['DESN 301'],
                    severity: 'warning',
                    message: 'Room 212 is reserved for Visual Storytelling sequence.'
                }
            }
        ];

        const result = ConflictEngine.evaluate(schedule, constraints, {
            currentQuarter: 'fall',
            scheduleByQuarter: { fall: schedule, winter: [], spring: [] }
        });

        const issue = [...result.conflicts, ...result.warnings].find((entry) => entry.type === 'student-conflict');
        expect(issue).toBeTruthy();
        const targetSlots = (issue.resolutions || []).map((resolution) => resolution.target_slot);
        expect(targetSlots).not.toContain('TR 16:00-18:20');
    });

    test('room-based recommendations include room-fit reasoning and recommendation scoring', () => {
        const schedule = [
            { code: 'DESN 243', day: 'TR', time: '13:00-15:20', room: '212', instructor: 'S.Durr' },
            { code: 'DESN 200', day: 'TR', time: '13:00-15:20', room: '206', instructor: 'A.Sopu' }
        ];
        const constraints = [
            {
                id: 'room-212-restriction',
                enabled: true,
                constraint_type: 'room_restriction',
                rule_details: {
                    room: '212',
                    allowed_courses: ['DESN 301'],
                    severity: 'warning',
                    message: 'Room 212 is reserved for Visual Storytelling sequence.'
                }
            },
            {
                id: 'room-210-preference',
                enabled: true,
                constraint_type: 'room_restriction',
                rule_details: {
                    room: '210',
                    preferred_courses: ['DESN 301'],
                    severity: 'warning',
                    message: 'Room 210 is usually better for story courses.'
                }
            }
        ];

        const result = ConflictEngine.evaluate(schedule, constraints, {
            currentQuarter: 'winter',
            scheduleByQuarter: { fall: [], winter: schedule, spring: [] }
        });

        const issue = [...result.conflicts, ...result.warnings].find((entry) =>
            String(entry.title || '').includes('Room 212 Restriction')
        );
        expect(issue).toBeTruthy();
        expect((issue.resolutions || []).length).toBeGreaterThan(0);

        issue.resolutions.forEach((resolution) => {
            expect(typeof resolution.recommendationScore).toBe('number');
            expect(typeof resolution.roomFitStatus).toBe('string');
            expect(typeof resolution.roomFitSummary).toBe('string');
            expect(String(resolution.reason || '')).toContain('Room fit:');
        });
    });
});
