const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

function readDoc(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('platformization audit docs', () => {
    test('audit describes the hybrid platform state and key blocking areas', () => {
        const auditDoc = readDoc('docs/audits/platformization-audit.md');

        expect(auditDoc).toContain('## Current Hybrid Platform State');
        expect(auditDoc).toContain('Design-seeded defaults');
        expect(auditDoc).toContain('Local profile activation model');
        expect(auditDoc).toContain('Program-aware runtime path');
        expect(auditDoc).toContain('PTA-001');
    });

    test('blocker doc stays short and focused on phase-2 entry blockers', () => {
        const blockersDoc = readDoc('docs/audits/multi-department-blockers.md');

        expect(blockersDoc).toContain('## Blocking Categories');
        expect(blockersDoc).toContain('Canonical Runtime Identity');
        expect(blockersDoc).toContain('Canonical Profile Source');
        expect(blockersDoc).toContain('Phase 2 cannot begin while any blocker above remains unresolved');
    });

    test('profile schema and onboarding qa pack now acknowledge the transitional hybrid state', () => {
        const profileSchemaDoc = readDoc('docs/department-profile-schema-v1.md');
        const onboardingQaDoc = readDoc('docs/department-onboarding-qa-pack.md');

        expect(profileSchemaDoc).toContain('## Current Runtime Position');
        expect(profileSchemaDoc).toContain('Release-Gate Implication');
        expect(onboardingQaDoc).toContain('## Current Status');
        expect(onboardingQaDoc).toContain('### Preconditions');
        expect(onboardingQaDoc).toContain('docs/audits/multi-department-release-gate.md');
    });
});
