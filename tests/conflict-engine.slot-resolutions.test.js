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

describe('ConflictEngine resolution slot alignment', () => {
    const ConflictEngine = loadScriptModule('js/conflict-engine.js');

    function buildPathwayConflictSchedule() {
        return [
            { code: 'DESN 100', day: 'MW', time: '10:00-12:20', room: '206', instructor: 'A.Sopu' },
            { code: 'DESN 216', day: 'MW', time: '10:00-12:20', room: '207', instructor: 'S.Durr' },
            { code: 'DESN 243', day: 'TR', time: '13:00-15:20', room: '208', instructor: 'M.Lybbert' }
        ];
    }

    function evaluateStudentConflict(ruleDetails = {}) {
        const schedule = buildPathwayConflictSchedule();
        const constraints = [
            {
                id: 'student-pathway',
                enabled: true,
                constraint_type: 'student_conflict',
                rule_details: {
                    severity: 'critical',
                    ...ruleDetails
                }
            }
        ];

        return ConflictEngine.evaluate(schedule, constraints, {
            currentQuarter: 'fall',
            scheduleByQuarter: { fall: schedule, winter: [], spring: [] }
        });
    }

    test('dynamic conflict resolutions use current scheduler slot labels', () => {
        const result = evaluateStudentConflict();
        expect(result.conflicts.length).toBeGreaterThan(0);

        const resolutions = result.conflicts[0].resolutions || [];
        expect(resolutions.length).toBeGreaterThan(0);

        const canonicalTimes = new Set(['10:00-12:20', '13:00-15:20', '16:00-18:20']);
        resolutions.forEach((resolution) => {
            if (!resolution.target_slot) return;
            const [, time] = String(resolution.target_slot).split(/\s+/, 2);
            expect(canonicalTimes.has(time)).toBe(true);
        });

        const serialized = JSON.stringify(resolutions);
        expect(serialized.includes('10:00-12:00')).toBe(false);
        expect(serialized.includes('13:00-15:00')).toBe(false);
        expect(serialized.includes('16:00-18:00')).toBe(false);
    });

    test('normalizes legacy preferred resolution slots before displaying suggestions', () => {
        const result = evaluateStudentConflict({
            preferred_resolutions: [
                { action: 'move_course', target_slot: 'MW 16:00-18:00', reason: 'Legacy evening suggestion' },
                { action: 'move_course', target_slot: 'TR 16:00-18:00', reason: 'Legacy evening alt' }
            ]
        });

        expect(result.conflicts.length).toBeGreaterThan(0);
        const resolutions = result.conflicts[0].resolutions || [];
        const targets = resolutions.map((resolution) => resolution.target_slot).filter(Boolean);

        expect(targets).toContain('MW 16:00-18:20');
        expect(targets).toContain('TR 16:00-18:20');
        expect(targets.some((target) => target.includes('16:00-18:00'))).toBe(false);
    });
});
