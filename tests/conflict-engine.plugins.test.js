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

describe('ConflictEngine pluggable rule registry (CE-02)', () => {
    const ConflictEngine = loadScriptModule('js/conflict-engine.js');

    function buildFacultyConflictSchedule() {
        return [
            { code: 'DESN 301', day: 'MW', time: '10:00-12:20', room: '206', instructor: 'S.Mills' },
            { code: 'DESN 401', day: 'MW', time: '10:00-12:20', room: '209', instructor: 'S.Mills' }
        ];
    }

    function buildFacultyConstraint() {
        return [
            {
                id: 'faculty-double-book',
                enabled: true,
                constraint_type: 'faculty_double_book',
                rule_details: { severity: 'critical' }
            }
        ];
    }

    test('exposes registry APIs and keeps findIssues backward-compatible with evaluate', () => {
        expect(typeof ConflictEngine.registerRule).toBe('function');
        expect(typeof ConflictEngine.enableRule).toBe('function');
        expect(typeof ConflictEngine.disableRule).toBe('function');
        expect(typeof ConflictEngine.setWeight).toBe('function');
        expect(typeof ConflictEngine.listRules).toBe('function');
        expect(typeof ConflictEngine.findIssues).toBe('function');

        const schedule = buildFacultyConflictSchedule();
        const constraints = buildFacultyConstraint();

        const evaluateResult = ConflictEngine.evaluate(schedule, constraints);
        const findIssuesResult = ConflictEngine.findIssues(schedule, constraints);

        expect(JSON.stringify(findIssuesResult)).toBe(JSON.stringify(evaluateResult));
    });

    test('supports enable/disable toggles for registered rules', () => {
        const schedule = buildFacultyConflictSchedule();
        const constraints = buildFacultyConstraint();

        expect(ConflictEngine.disableRule('faculty_double_book')).toBe(true);
        const disabledResult = ConflictEngine.evaluate(schedule, constraints);
        expect(disabledResult.conflicts).toHaveLength(0);

        expect(ConflictEngine.enableRule('faculty_double_book')).toBe(true);
        const enabledResult = ConflictEngine.evaluate(schedule, constraints);
        expect(enabledResult.conflicts.length).toBeGreaterThan(0);
    });

    test('supports program-level rule enable overrides and plugin weights', () => {
        const schedule = buildFacultyConflictSchedule();
        const constraints = buildFacultyConstraint();

        const disabledByOverride = ConflictEngine.evaluate(schedule, constraints, {
            ruleOverrides: {
                faculty_double_book: { enabled: false }
            }
        });
        expect(disabledByOverride.conflicts).toHaveLength(0);

        ConflictEngine.setWeight('faculty_double_book', 1);
        const base = ConflictEngine.evaluate(schedule, constraints);
        ConflictEngine.setWeight('faculty_double_book', 1.6);
        const weighted = ConflictEngine.evaluate(schedule, constraints);

        expect(weighted.conflicts[0].score).toBeGreaterThan(base.conflicts[0].score);

        // Reset shared plugin weight for deterministic suite behavior.
        ConflictEngine.setWeight('faculty_double_book', 1);
    });

    test('registerRule allows new plugins without core engine changes', () => {
        const customId = 'custom_test_rule';
        ConflictEngine.registerRule({
            id: customId,
            name: 'Custom Test Rule',
            tier: 'suggestion',
            detect: (schedule) => ([
                {
                    severity: 'info',
                    title: 'Custom Test Issue',
                    description: `Schedule size: ${schedule.length}`
                }
            ])
        });

        const result = ConflictEngine.evaluate(
            [{ code: 'DESN 100', day: 'MW', time: '10:00-12:20', room: '206', instructor: 'A.User' }],
            [{ id: customId, enabled: true, constraint_type: customId, rule_details: {} }]
        );

        expect(result.suggestions).toHaveLength(1);
        expect(result.suggestions[0].rulePluginId).toBe(customId);
        expect(result.suggestions[0].rulePluginName).toBe('Custom Test Rule');
    });
});
