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

describe('ScheduleHistoryAnalyzer (CE-04)', () => {
    const analyzer = loadScriptModule('js/schedule-history-analyzer.js');

    function loadHistoricalRows() {
        const csvPath = path.resolve(__dirname, '..', 'enrollment-data/processed/corrected-all-quarters.csv');
        const csvText = fs.readFileSync(csvPath, 'utf8');
        return analyzer.parseCsv(csvText);
    }

    test('processes existing 4-year enrollment history and extracts patterns', () => {
        const rows = loadHistoricalRows();
        expect(rows.length).toBeGreaterThan(300);

        const analysis = analyzer.analyzePatterns(rows);

        expect(analysis.totalRecords).toBeGreaterThan(300);
        expect(Array.isArray(analysis.academicYears)).toBe(true);
        expect(analysis.academicYears.length).toBeGreaterThanOrEqual(4);
        expect(Array.isArray(analysis.patterns)).toBe(true);
        expect(analysis.patterns.length).toBeGreaterThanOrEqual(10);
    });

    test('produces actionable, explainable recommendations with confidence scores', () => {
        const rows = loadHistoricalRows();
        const analysis = analyzer.analyzePatterns(rows);

        expect(Array.isArray(analysis.recommendations)).toBe(true);
        expect(analysis.recommendations.length).toBeGreaterThanOrEqual(10);

        analysis.recommendations.forEach((rec) => {
            expect(typeof rec.confidence).toBe('number');
            expect(rec.confidence).toBeGreaterThanOrEqual(0.1);
            expect(rec.confidence).toBeLessThanOrEqual(0.99);
            expect(typeof rec.explanation).toBe('string');
            expect(rec.explanation.length).toBeGreaterThan(0);
        });
    });

    test('returns successes, problems, and learned-rule output for conflict-engine integration', () => {
        const rows = loadHistoricalRows();
        const analysis = analyzer.analyzePatterns(rows);

        expect(analysis.successes.length).toBeGreaterThan(0);
        expect(analysis.problems.length).toBeGreaterThan(0);
        expect(Array.isArray(analysis.learnedRules)).toBe(true);
        expect(analysis.learnedRules.length).toBeGreaterThan(0);

        const sampleRule = analysis.learnedRules[0];
        expect(sampleRule.source).toBe('schedule_history_analyzer');
        expect(typeof sampleRule.ruleType).toBe('string');
    });
});
