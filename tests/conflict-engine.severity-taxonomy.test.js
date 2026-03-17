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

describe('ConflictEngine severity taxonomy (CE-01)', () => {
    const ConflictEngine = loadScriptModule('js/conflict-engine.js');

    test('maps legacy critical severity to hard_block tier while keeping backward-compatible severity field', () => {
        const schedule = [
            { code: 'DESN 301', day: 'MW', time: '10:00-12:20', room: '206', instructor: 'S.Mills' },
            { code: 'DESN 401', day: 'MW', time: '10:00-12:20', room: '209', instructor: 'S.Mills' }
        ];

        const constraints = [
            {
                id: 'faculty-double-book',
                enabled: true,
                constraint_type: 'faculty_double_book',
                rule_details: { severity: 'critical' }
            }
        ];

        const result = ConflictEngine.evaluate(schedule, constraints);
        const issue = result.conflicts[0];

        expect(issue.severityTier).toBe('hard_block');
        expect(issue.tier).toBe('hard_block');
        expect(issue.severity).toBe('critical');
        expect(issue.blocksSave).toBe(true);
        expect(result.summary.tierCounts.hard_block).toBe(1);
    });

    test('maps info-level issues to suggestion tier', () => {
        const schedule = [
            { code: 'DESN 301', day: 'MW', time: '10:00-12:20', room: '206', instructor: 'S.Mills' }
        ];

        const constraints = [
            {
                id: 'room-preference',
                enabled: true,
                constraint_type: 'room_restriction',
                rule_details: {
                    room: '206',
                    preferred_courses: ['DESN 355']
                }
            }
        ];

        const result = ConflictEngine.evaluate(schedule, constraints);
        expect(result.suggestions.length).toBeGreaterThan(0);

        const issue = result.suggestions[0];
        expect(issue.severity).toBe('info');
        expect(issue.severityTier).toBe('suggestion');
        expect(issue.blocksSave).toBe(false);
    });

    test('promotes low-tier student conflicts near graduation deadlines', () => {
        const schedule = [
            { code: 'DESN 338', day: 'MW', time: '10:00-12:20', room: '206', instructor: 'A.One' },
            { code: 'DESN 355', day: 'MW', time: '10:00-12:20', room: '209', instructor: 'B.Two' }
        ];

        const constraints = [
            {
                id: 'student-pathway',
                enabled: true,
                constraint_type: 'student_conflict',
                rule_details: { severity: 'info' }
            }
        ];

        const result = ConflictEngine.evaluate(schedule, constraints, {
            daysUntilGraduation: 30
        });

        expect(result.warnings.length).toBeGreaterThan(0);
        const issue = result.warnings[0];
        expect(issue.severityTier).toBe('warning');
        expect(issue.severity).toBe('warning');
    });
});
