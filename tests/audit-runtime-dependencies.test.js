const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts', 'audit-runtime-dependencies.js');
const inventoryDocPath = path.join(repoRoot, 'docs', 'audits', 'production-surface-inventory.md');
const readmePath = path.join(repoRoot, 'docs', 'audits', 'README.md');
const evidenceModelPath = path.join(repoRoot, 'docs', 'audits', 'audit-evidence-model.md');

function runScan(targets = []) {
    const args = [scriptPath, ...targets];
    const output = execFileSync('node', args, {
        cwd: repoRoot,
        encoding: 'utf8'
    });

    return JSON.parse(output);
}

describe('audit runtime dependency scanner', () => {
    let tempDir;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-runtime-deps-'));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('reports local static data fetches, localStorage usage, fallback markers, and design defaults', () => {
        const flaggedFile = path.join(tempDir, 'flagged.js');
        fs.writeFileSync(flaggedFile, [
            "const CURRENT_DEPARTMENT_CODE = 'DESN';",
            "const defaultProfile = 'design-v1';",
            "const raw = localStorage.getItem('draft');",
            "const response = await fetch('../data/course-catalog.json');",
            "console.warn('Using embedded fallback profile because no profile file could be loaded.');"
        ].join('\n'));

        const report = runScan([flaggedFile]);
        const fileResult = report.files[0];

        expect(report.summary.filesScanned).toBe(1);
        expect(report.summary.counts.localJsonFetches).toBe(1);
        expect(report.summary.counts.localStorageUsages).toBe(1);
        expect(report.summary.counts.fallbackMarkers).toBeGreaterThanOrEqual(1);
        expect(report.summary.counts.designDefaults).toBeGreaterThanOrEqual(2);
        expect(fileResult.path).toBe(flaggedFile);
        expect(fileResult.matches.localJsonFetches[0]).toMatchObject({
            line: 4,
            detail: '../data/course-catalog.json'
        });
        expect(fileResult.matches.localStorageUsages[0]).toMatchObject({ line: 3 });
    });

    test('returns empty match sets for files without flagged patterns', () => {
        const cleanFile = path.join(tempDir, 'clean.js');
        fs.writeFileSync(cleanFile, [
            'function add(a, b) {',
            '  return a + b;',
            '}'
        ].join('\n'));

        const report = runScan([cleanFile]);
        const fileResult = report.files[0];

        expect(report.summary.filesScanned).toBe(1);
        expect(report.summary.filesWithMatches).toBe(0);
        expect(fileResult.matches).toEqual({
            localJsonFetches: [],
            localStorageUsages: [],
            fallbackMarkers: [],
            designDefaults: []
        });
    });

    test('reports missing targets as explicit failures', () => {
        const missingFile = path.join(tempDir, 'missing.js');
        const report = runScan([missingFile]);

        expect(report.files).toHaveLength(0);
        expect(report.failures).toHaveLength(1);
        expect(report.failures[0]).toMatchObject({
            path: missingFile,
            code: 'ENOENT'
        });
    });
});

describe('audit docs alignment', () => {
    test('inventory doc lists every default scan target', () => {
        const report = runScan();
        const inventoryDoc = fs.readFileSync(inventoryDocPath, 'utf8');

        expect(report.targetsUsed.length).toBeGreaterThan(0);
        report.targetsUsed.forEach((target) => {
            expect(inventoryDoc).toContain(`- \`${target}\``);
        });
    });

    test('audit docs establish the readiness-audit workspace and evidence model', () => {
        const readme = fs.readFileSync(readmePath, 'utf8');
        const evidenceModel = fs.readFileSync(evidenceModelPath, 'utf8');

        expect(readme).toContain('The audit is organized around four readiness pillars');
        expect(readme).toContain('production-surface-inventory.md');
        expect(evidenceModel).toContain('## Finding Record');
        expect(evidenceModel).toContain('Unknowns are allowed in pillar audits. They are not allowed in a passed release gate.');
    });
});
