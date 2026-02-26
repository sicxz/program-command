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

describe('ConflictEngine v2 scoring metadata', () => {
    const ConflictEngine = loadScriptModule('js/conflict-engine.js');

    function buildFacultyConflictSchedule() {
        return [
            { code: 'DESN 301', day: 'MW', time: '10:00-12:20', room: '206', instructor: 'S.Mills' },
            { code: 'DESN 401', day: 'MW', time: '10:00-12:20', room: '209', instructor: 'S.Mills' },
            { code: 'DESN 243', day: 'TR', time: '13:00-15:20', room: '210', instructor: 'S.Durr' }
        ];
    }

    function evaluateFacultyConflict(ruleDetails = {}) {
        const schedule = buildFacultyConflictSchedule();
        const constraints = [
            {
                id: 'faculty-double-book',
                enabled: true,
                constraint_type: 'faculty_double_book',
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

    test('emits v2 scoring metadata with explainable weighted output', () => {
        const result = evaluateFacultyConflict();

        expect(result.scoringModel).toBeTruthy();
        expect(result.scoringModel.version).toBe('v2');
        expect(result.scoringModel.registry).toBeTruthy();
        expect(result.scoringModel.registry.faculty_double_book.hardness).toBe('hard');
        expect(Array.isArray(ConflictEngine.ruleRegistry.student_conflict.pairings)).toBe(true);
        expect(ConflictEngine.ruleRegistry.student_conflict.pairings.length).toBeGreaterThan(0);

        expect(result.conflicts.length).toBeGreaterThan(0);
        const issue = result.conflicts[0];
        expect(typeof issue.score).toBe('number');
        expect(issue.score).toBeGreaterThan(0);
        expect(typeof issue.scoreExplanation).toBe('string');
        expect(issue.scoreExplanation).toContain('Faculty Double Booking');
        expect(issue.scoreRuleMeta).toMatchObject({
            id: 'faculty_double_book',
            hardness: 'hard'
        });
        expect(Array.isArray(issue.scoreBreakdown?.contributions)).toBe(true);
        expect(issue.scoreBreakdown.contributions.some((c) => c.source === 'severity')).toBe(true);
        expect(issue.scoreBreakdown.contributions.some((c) => c.source === 'registry-base')).toBe(true);

        expect(result.summary.weightedScore).toBe(issue.score);
        expect(result.summary.weightedByConstraintType.faculty_double_book).toBe(issue.score);
    });

    test('weighted scores are deterministic and respect rule weight overrides', () => {
        const baselineA = evaluateFacultyConflict();
        const baselineB = evaluateFacultyConflict();
        const weighted = evaluateFacultyConflict({ weight: 1.5 });

        const baselineScoreA = baselineA.conflicts[0].score;
        const baselineScoreB = baselineB.conflicts[0].score;
        const weightedScore = weighted.conflicts[0].score;

        expect(baselineScoreA).toBe(baselineScoreB);
        expect(JSON.stringify(baselineA.conflicts[0].scoreBreakdown)).toBe(
            JSON.stringify(baselineB.conflicts[0].scoreBreakdown)
        );
        expect(weightedScore).toBeGreaterThan(baselineScoreA);
        expect(weighted.conflicts[0].scoreBreakdown.contributions.some((c) => c.source === 'rule-weight')).toBe(true);
    });
});
