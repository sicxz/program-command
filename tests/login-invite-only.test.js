const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectFile = (relativePath) => fs.readFileSync(
    path.resolve(__dirname, '..', relativePath),
    'utf8'
);

function loadAuthService(url) {
    const parsed = new URL(url);
    const sandbox = {
        console,
        URL,
        URLSearchParams,
        document: { addEventListener: jest.fn() },
        window: {
            location: {
                href: parsed.href,
                origin: parsed.origin,
                pathname: parsed.pathname,
                search: parsed.search,
                hash: parsed.hash
            }
        },
        module: { exports: {} },
        exports: {}
    };

    vm.createContext(sandbox);
    vm.runInContext(projectFile('js/auth-service.js'), sandbox, {
        filename: 'js/auth-service.js'
    });
    return sandbox.module.exports;
}

describe('invite-only login', () => {
    test('removes social sign-in and linking markup and controller copy', () => {
        const markup = projectFile('login.html');
        const controller = projectFile('pages/login.js');

        expect(markup).not.toMatch(/oauth/i);
        expect(markup).not.toMatch(/continue with/i);
        expect(markup).not.toContain('linkingPanel');
        expect(controller).not.toMatch(/oauth/i);
        expect(controller).not.toMatch(/continue with/i);
        expect(controller).not.toContain('linkingPanel');
    });

    test('includes invitation, reset, and set-password markup', () => {
        const markup = projectFile('login.html');

        expect(markup).toContain('Access is by invitation only.');
        expect(markup).toContain('id="resetForm"');
        expect(markup).toContain('id="setPasswordForm"');
    });

    test('does not expose removed account-creation or social auth methods', () => {
        const service = loadAuthService('https://program-command.local/login.html');

        expect(service.beginOAuthSignIn).toBeUndefined();
        expect(service.beginOAuthLink).toBeUndefined();
        expect(service.signUp).toBeUndefined();
    });

    test('detects invite links from the URL hash', () => {
        const service = loadAuthService(
            'https://program-command.local/login.html#access_token=x&type=invite'
        );

        expect(service.getAuthRedirectType()).toBe('invite');
    });

    test('detects recovery links from the URL query', () => {
        const service = loadAuthService(
            'https://program-command.local/login.html?type=recovery'
        );

        expect(service.getAuthRedirectType()).toBe('recovery');
    });

    test('ignores URLs without an invite or recovery redirect type', () => {
        const service = loadAuthService(
            'https://program-command.local/login.html?type=other#access_token=x'
        );

        expect(service.getAuthRedirectType()).toBe('');
    });

    test('session bar no longer includes a link-login control', () => {
        expect(projectFile('js/auth-guard.js')).not.toContain('authSessionLinkLogin');
    });

    test('hidden forms stay hidden despite the grid layout rule', () => {
        const markup = require('fs').readFileSync(require('path').resolve(__dirname, '..', 'login.html'), 'utf8');
        expect(markup).toMatch(/\.login-form\[hidden\]\s*\{\s*display:\s*none;/);
    });
});

