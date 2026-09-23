const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const authGuardSource = fs.readFileSync(path.join(ROOT, 'js/auth-guard.js'), 'utf8');
const programCommandSource = fs.readFileSync(path.join(ROOT, 'program-command.html'), 'utf8');

function cssRule(source, selector) {
    const start = source.indexOf(`${selector} {`);
    if (start === -1) return '';
    return source.slice(start, source.indexOf('}', start) + 1);
}

function accountsBranch(source) {
    const start = source.indexOf("action === 'accounts'");
    if (start === -1) return '';
    const end = source.indexOf('} else if (action ===', start + 1);
    return source.slice(start, end === -1 ? undefined : end);
}

describe('session strip', () => {
    const indicatorRule = cssRule(authGuardSource, '.auth-session-indicator');

    test('indicator is a square strip in the page flow', () => {
        expect(indicatorRule).not.toBe('');
        expect(indicatorRule).not.toMatch(/position:\s*fixed/);
        expect(indicatorRule).toMatch(/border-radius:\s*0;/);
    });

    test('indicator is prepended to the body', () => {
        expect(authGuardSource).toMatch(/document\.body\.prepend\(indicator\)/);
        expect(authGuardSource).not.toMatch(/document\.body\.appendChild\(indicator\)/);
    });

    test('unused .auth-session-link rules are gone', () => {
        expect(authGuardSource).not.toContain('.auth-session-link');
    });
});

describe('Settings > Users & Accounts', () => {
    const branch = accountsBranch(programCommandSource);

    test('keeps the permission check and navigates to the Users page', () => {
        expect(branch).toContain("canPerform('manage', 'accounts')");
        expect(branch).toContain("navigateWithDirtyGuard('pages/user-management.html')");
    });

    test('no longer shows the not-implemented toast', () => {
        expect(programCommandSource).not.toContain('not implemented yet');
    });
});
