const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'program-command.html'), 'utf8');
const constants = require('../js/config/constants.js');

test('uses the shared low-enrollment threshold of 10 students', () => {
    expect(constants.THRESHOLDS.LOW_ENROLLMENT).toBe(10);
});

test('removes the obsolete low-enrollment comparisons', () => {
    expect(html).not.toContain('average < 15');
    expect(html).not.toContain('enrolled <= 8');
});

test('uses the low-enrollment helper for both rules and the label', () => {
    expect(html).toContain('function lowEnrollmentThreshold');
    expect(html.match(/lowEnrollmentThreshold\(\)/g).length).toBeGreaterThanOrEqual(3);
});

test('bridges the low-enrollment helper to classic scripts', () => {
    const bridge = html.match(/Object\.assign\(window,\s*\{([\s\S]*?)\}\);/);
    expect(bridge).not.toBeNull();
    expect(bridge[1]).toMatch(/\blowEnrollmentThreshold\b/);
});

test('reads the current page threshold with a fallback of 10', () => {
    const helper = html.match(/function lowEnrollmentThreshold\(\)\s*\{[\s\S]*?\n\s*\}/);
    expect(helper).not.toBeNull();

    const runHelper = window => vm.runInNewContext(
        `${helper[0]}; lowEnrollmentThreshold();`,
        { window }
    );

    expect(runHelper({})).toBe(10);
    expect(runHelper({ CONSTANTS: { THRESHOLDS: { LOW_ENROLLMENT: 7 } } })).toBe(7);
});
