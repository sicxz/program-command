const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const htmlPath = path.join(ROOT, 'program-command.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const curriculumSource = fs.readFileSync(path.join(ROOT, 'js', 'advising-curriculum.js'), 'utf8');

describe('Program Command Advising v1 integration', () => {
    test('loads the advisor-led planner in dependency order', () => {
        const scripts = [
            'js/advising-curriculum.js',
            'js/advising-planner.js',
            'js/components/advising-pathway-planner.js',
            'js/advising-controller.js'
        ];

        expect(html).toContain('<advising-pathway-planner id="mainAdvisingPlanner">');

        let previousIndex = -1;
        const assetVersions = [];
        scripts.forEach((script) => {
            const escapedScript = script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const match = html.match(new RegExp(
                `<script defer src="${escapedScript}\\?v=([^"]+)"></script>`
            ));
            const index = match ? html.indexOf(match[0]) : -1;
            expect(index).toBeGreaterThan(previousIndex);
            assetVersions.push(match && match[1]);
            previousIndex = index;
        });

        const curriculumVersion = curriculumSource.match(/const ASSET_VERSION = '([^']+)'/);
        expect(new Set(assetVersions)).toEqual(new Set([curriculumVersion && curriculumVersion[1]]));
    });

    test('keeps the schedule primary and launches Advising in an accessible workspace dialog', () => {
        const dialogStart = html.indexOf('<dialog class="advising-workspace-dialog"');
        const dialogEnd = html.indexOf('</dialog>', dialogStart);
        const plannerStart = html.indexOf('<advising-pathway-planner id="mainAdvisingPlanner">');

        expect(html).toContain('id="openAdvisingWorkspace"');
        expect(html).toContain('aria-haspopup="dialog" aria-controls="advisingWorkspaceDialog"');
        expect(dialogStart).toBeGreaterThan(-1);
        expect(dialogEnd).toBeGreaterThan(dialogStart);
        expect(plannerStart).toBeGreaterThan(dialogStart);
        expect(plannerStart).toBeLessThan(dialogEnd);
        expect(html).toContain('aria-labelledby="advisingWorkspaceTitle"');
        expect(html).toContain('aria-describedby="advisingWorkspaceDescription"');
        expect(html).toContain('id="closeAdvisingWorkspace"');
        expect(html).toContain('aria-label="Close Advising workspace"');
        expect(html).toContain('class="advising-workspace-scroll"');
        expect(html.match(/<advising-pathway-planner\b/g)).toHaveLength(1);
        expect(html).toContain('width: 100dvw;');
        expect(html).toContain('height: 100dvh;');
        expect(html).toContain('overflow-x: hidden;');
    });

    test('removes the obsolete track-and-single-minor runtime', () => {
        const obsoleteTokens = [
            ['lens', 'filters'].join('-'),
            ['track', 'Filter'].join(''),
            ['minor', 'Filter'].join(''),
            ['current', 'Track'].join(''),
            ['current', 'Minor'].join(''),
            ['filter', 'change'].join('-'),
            ['minor', 'highlight'].join('-')
        ];

        obsoleteTokens.forEach((token) => expect(html).not.toContain(token));
        expect(fs.existsSync(path.join(ROOT, 'js', 'components', ['lens', 'filters.js'].join('-')))).toBe(false);
    });

    test('keeps the schedule and dashboard navigation hosts intact', () => {
        expect(html).toContain('<quarter-nav id="mainQuarterNav"></quarter-nav>');
        expect(html).toContain('id="scheduleGridTitle"');
        expect(html).toContain('id="navAccordionContent"');
        expect(html).toContain('href="enrollment-dashboard.html"');
        expect(html).toContain('href="pages/workload-dashboard.html"');
    });

    test('does not write advising selections into schedule state', () => {
        expect(html).not.toMatch(/StateManager\.set\([^\n]*(?:Track|Minor)/);
        expect(html).not.toMatch(/localStorage\.[^(]+\([^\n]*(?:advis|lens)/i);
    });
});
