const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'program-command.html'), 'utf8');

function extractRule(selector) {
    const start = html.indexOf(selector);
    if (start < 0) throw new Error(`Could not find CSS rule: ${selector}`);

    const end = html.indexOf('}', start);
    if (end < 0) throw new Error(`Could not find the end of CSS rule: ${selector}`);

    return html.slice(start, end + 1);
}

describe('Program Command production course block fill', () => {
    test('makes schedule cells column flex containers', () => {
        const rule = extractRule('body.foundry-production .schedule-cell {');

        expect(rule).toContain('display: flex;');
        expect(rule).toContain('flex-direction: column;');
    });

    test('keeps single-course cells as column flex containers', () => {
        const rule = extractRule('body.foundry-production .schedule-cell.single-course-cell {');

        expect(rule).toContain('display: flex;');
        expect(rule).toContain('flex-direction: column;');
    });

    test('allows course blocks to fill their cells while preserving minimum height', () => {
        const rule = extractRule('body.foundry-production .course-block {');

        expect(rule).toContain('flex: 1 1 auto;');
        expect(rule).toContain('min-height: 88px;');
    });
});
