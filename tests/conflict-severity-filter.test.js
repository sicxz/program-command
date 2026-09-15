const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = path.resolve(__dirname, '..', 'program-command.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function extractFunction(name) {
    const pattern = new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n        \\}`);
    const match = html.match(pattern);
    if (!match) throw new Error(`Could not extract ${name} from program-command.html`);
    return match[0];
}

describe('Program Command conflict severity filter', () => {
    test('conflictCodesForSeverity returns course-code Sets for critical and high conflicts', () => {
        const sandbox = {};
        vm.createContext(sandbox);
        vm.runInContext(
            `${extractFunction('extractConflictCourseCode')}\n${extractFunction('conflictCodesForSeverity')}`,
            sandbox
        );

        const conflicts = [
            { severity: 'critical', courses: ['DESN 301 — Studio', 'DESN 401 — Capstone'] },
            { severity: 'high', courses: ['DESN 355 — Interaction Design'] },
            { severity: 'medium', courses: ['DESN 216 — Digital Foundations'] }
        ];

        expect([...sandbox.conflictCodesForSeverity(conflicts, 'critical')]).toEqual([
            'DESN 301',
            'DESN 401'
        ]);
        expect([...sandbox.conflictCodesForSeverity(conflicts, 'high')]).toEqual(['DESN 355']);
    });

    test('markup provides All, Critical, High, and No conflict radio options', () => {
        const groupMatch = html.match(/<fieldset[^>]*id="conflictFilter"[\s\S]*?<\/fieldset>/);
        expect(groupMatch).not.toBeNull();

        const inputs = [...groupMatch[0].matchAll(/<input\s+type="radio"[^>]*>/g)].map((match) => match[0]);
        expect(inputs).toHaveLength(4);
        expect(inputs.map((input) => input.match(/value="([^"]+)"/)[1])).toEqual([
            'all',
            'critical',
            'high',
            'none'
        ]);
        expect(inputs[0]).toMatch(/\schecked(?:\s|>)/);
    });
});
