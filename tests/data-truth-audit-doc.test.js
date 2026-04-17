const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

function readDoc(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('data truth audit docs', () => {
    test('defines all required source classes and surface decisions', () => {
        const auditDoc = readDoc('docs/audits/data-truth-audit.md');

        expect(auditDoc).toContain('`canonical-db-backed`');
        expect(auditDoc).toContain('`acceptable-local-draft-state`');
        expect(auditDoc).toContain('`legacy-fallback`');
        expect(auditDoc).toContain('`unknown-or-mixed`');
        expect(auditDoc).toContain('Main scheduler (`index.html`)');
        expect(auditDoc).toContain('Schedule builder (`pages/schedule-builder.js`)');
        expect(auditDoc).toContain('Department onboarding and profile runtime');
    });

    test('captures data-truth gate implications and proof requirements', () => {
        const auditDoc = readDoc('docs/audits/data-truth-audit.md');

        expect(auditDoc).toContain('## Gate Implications');
        expect(auditDoc).toContain('## Proof Required To Pass');
        expect(auditDoc).toContain('DTR-001');
        expect(auditDoc).toContain('Blocks multi-department');
    });

    test('policy distinguishes allowed draft state from disallowed production fallback behavior', () => {
        const policyDoc = readDoc('docs/audits/production-source-of-truth-policy.md');

        expect(policyDoc).toContain('## Allowed Runtime Patterns');
        expect(policyDoc).toContain('## Disallowed Runtime Patterns On Release-Gated Surfaces');
        expect(policyDoc).toContain('## Local Draft State Rule');
        expect(policyDoc).toContain('Embedded fallback production data in runtime code');
        expect(policyDoc).toContain('Local draft state for unsaved edits');
    });

    test('existing verification docs now point back to the source-of-truth audit story', () => {
        const freshnessDoc = readDoc('docs/dev-data-freshness.md');
        const saveContractDoc = readDoc('docs/scheduler-save-contract.md');

        expect(freshnessDoc).toContain('docs/audits/data-truth-audit.md');
        expect(freshnessDoc).toContain('docs/audits/production-source-of-truth-policy.md');
        expect(saveContractDoc).toContain('Persisted saved schedule state is canonical');
        expect(saveContractDoc).toContain('Local draft state may exist for in-progress editing');
    });
});
