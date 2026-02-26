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

describe('ConflictEngine pathway-aware scoring', () => {
    const ConflictEngine = loadScriptModule('js/conflict-engine.js');

    function evaluatePairConflict(courseA, courseB) {
        const schedule = [
            { code: courseA, day: 'TR', time: '13:00-15:20', room: '206', instructor: 'T.Masingale' },
            { code: courseB, day: 'TR', time: '13:00-15:20', room: '207', instructor: 'C.Manikoth' },
            { code: 'DESN 100', day: 'MW', time: '10:00-12:20', room: '208', instructor: 'A.Sopu' }
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

        const issue = [...result.conflicts, ...result.warnings].find((entry) => entry.type === 'student-conflict');
        return { result, issue };
    }

    test('pathway-critical clashes score higher than lower-impact pathway overlaps and remain explainable', () => {
        const senior = evaluatePairConflict('DESN 463', 'DESN 480');
        const lowerImpact = evaluatePairConflict('DESN 326', 'DESN 355');

        expect(senior.issue).toBeTruthy();
        expect(lowerImpact.issue).toBeTruthy();

        expect(senior.issue.pathwayImpact).toBe('graduation-critical');
        expect(senior.issue.pathwayImpactScore).toBeGreaterThan(lowerImpact.issue.pathwayImpactScore);
        expect(senior.issue.score).toBeGreaterThan(lowerImpact.issue.score);

        expect(senior.issue.scoreExplanation).toContain('pathway=graduation-critical');
        expect(
            senior.issue.scoreBreakdown.contributions.some((c) => c.source === 'pathway-impact')
        ).toBe(true);
    });
});
