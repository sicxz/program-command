const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

function readDoc(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('product consistency audit docs', () => {
    test('audit defines a common consistency rubric and representative surfaces', () => {
        const auditDoc = readDoc('docs/audits/product-consistency-audit.md');

        expect(auditDoc).toContain('## Consistency Rubric');
        expect(auditDoc).toContain('Shell structure');
        expect(auditDoc).toContain('Recommendations dashboard (`pages/recommendations-dashboard.html`)');
        expect(auditDoc).toContain('EagleNet compare (`pages/eaglenet-compare.html`, `pages/eaglenet-compare.js`)');
        expect(auditDoc).toContain('PCI-001');
    });

    test('baseline doc defines the shared shell direction and broader refresh trigger', () => {
        const baselineDoc = readDoc('docs/audits/dashboard-shell-baseline.md');

        expect(baselineDoc).toContain('## Baseline Candidate');
        expect(baselineDoc).toContain('`app-header`');
        expect(baselineDoc).toContain('`css/program-command-dashboard-theme.css`');
        expect(baselineDoc).toContain('## Broader Refresh Trigger');
    });

    test('ui guidelines now point to the audit baseline and release-gated shell expectations', () => {
        const uiDoc = readDoc('docs/ui/primer-product-ui-guidelines.md');

        expect(uiDoc).toContain('docs/audits/product-consistency-audit.md');
        expect(uiDoc).toContain('docs/audits/dashboard-shell-baseline.md');
        expect(uiDoc).toContain('## Release-Gated Shell Expectations');
        expect(uiDoc).toContain('Prefer the shared header direction');
    });
});
