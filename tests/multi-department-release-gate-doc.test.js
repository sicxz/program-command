const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

function readDoc(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('multi-department release gate docs', () => {
    test('operational confidence audit identifies the missing release-decision system', () => {
        const auditDoc = readDoc('docs/audits/operational-confidence-audit.md');

        expect(auditDoc).toContain('## Current Strengths');
        expect(auditDoc).toContain('## Current Gaps');
        expect(auditDoc).toContain('OCA-001');
        expect(auditDoc).toContain('Operational Confidence Pass Conditions');
    });

    test('release gate defines four pillars, statuses, and proof requirements', () => {
        const gateDoc = readDoc('docs/audits/multi-department-release-gate.md');

        expect(gateDoc).toContain('## Decision Rule');
        expect(gateDoc).toContain('The decision owner is the user as the sole builder');
        expect(gateDoc).toContain('## Gate Status Model');
        expect(gateDoc).toContain('| Data truth |');
        expect(gateDoc).toContain('| Product consistency |');
        expect(gateDoc).toContain('| Platformization |');
        expect(gateDoc).toContain('| Operational confidence |');
        expect(gateDoc).toContain('## Gate Board');
        expect(gateDoc).toContain('## Override Rule');
    });

    test('freshness doc now explains its place in the release-gate evidence model', () => {
        const freshnessDoc = readDoc('docs/dev-data-freshness.md');

        expect(freshnessDoc).toContain('For the multi-department release gate');
        expect(freshnessDoc).toContain('docs/audits/multi-department-release-gate.md');
    });
});
