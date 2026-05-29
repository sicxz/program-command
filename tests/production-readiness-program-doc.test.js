const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

function readDoc(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('production readiness program docs', () => {
    test('program doc defines named workstreams and dependency-informed sequencing', () => {
        const programDoc = readDoc('docs/audits/production-readiness-program.md');

        expect(programDoc).toContain('## Workstreams');
        expect(programDoc).toContain('W1. Canonical data/runtime convergence');
        expect(programDoc).toContain('W2. Shared dashboard shell convergence');
        expect(programDoc).toContain('W3. Canonical multi-department runtime contract');
        expect(programDoc).toContain('W4. Release evidence and operational discipline');
        expect(programDoc).toContain('## Recommended Sequence');
        expect(programDoc).toContain('## Phase-2 Entry Condition');
    });

    test('program doc ties workstreams back to the audit artifacts', () => {
        const programDoc = readDoc('docs/audits/production-readiness-program.md');

        expect(programDoc).toContain('docs/audits/data-truth-audit.md');
        expect(programDoc).toContain('docs/audits/product-consistency-audit.md');
        expect(programDoc).toContain('docs/audits/platformization-audit.md');
        expect(programDoc).toContain('docs/audits/multi-department-release-gate.md');
    });

    test('older audit backlog now points to the new readiness program framing', () => {
        const backlogDoc = readDoc('docs/AUDIT-ISSUES-2026-02-21.md');

        expect(backlogDoc).toContain('## Current Status In The Readiness Program');
        expect(backlogDoc).toContain('docs/audits/production-readiness-program.md');
        expect(backlogDoc).toContain('W1. Canonical data/runtime convergence');
        expect(backlogDoc).toContain('W4. Release evidence and operational discipline');
    });
});
