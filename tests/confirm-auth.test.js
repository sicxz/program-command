const fs = require('fs');
const path = require('path');
const vm = require('vm');

const script = fs.readFileSync(
    path.resolve(__dirname, '..', 'pages/confirm-auth.js'),
    'utf8'
);
const loginScript = fs.readFileSync(
    path.resolve(__dirname, '..', 'pages/login.js'),
    'utf8'
);

function openConfirmationPage(url, { lazyLoad = false, verifyOtpResult } = {}) {
    const parsed = new URL(url);
    const elements = Object.fromEntries(
        ['confirmHeading', 'confirmDescription', 'confirmButton', 'confirmError']
            .map((id) => [id, { textContent: '', hidden: id === 'confirmError', disabled: false }])
    );
    const listeners = {};
    elements.confirmButton.addEventListener = (event, handler) => {
        listeners[event] = handler;
    };

    const verifyOtp = jest.fn().mockResolvedValue(
        verifyOtpResult || { data: { session: { access_token: 'test-session' } }, error: null }
    );
    const client = { auth: { verifyOtp } };
    const appendedScripts = [];
    const window = {
        location: {
            search: parsed.search,
            pathname: parsed.pathname,
            replace: jest.fn()
        },
        history: { replaceState: jest.fn() }
    };
    if (!lazyLoad) window.getSupabaseClient = jest.fn(() => client);

    const document = {
        addEventListener(event, handler) {
            listeners[event] = handler;
        },
        getElementById(id) {
            return elements[id];
        },
        createElement: jest.fn(() => ({})),
        head: {
            appendChild: jest.fn((loadedScript) => {
                appendedScripts.push(loadedScript.src);
                if (loadedScript.src === 'js/supabase-config.js') {
                    window.getSupabaseClient = jest.fn(() => client);
                }
                Promise.resolve().then(() => loadedScript.onload());
            })
        }
    };

    vm.runInNewContext(script, { document, window, URLSearchParams, Set, Promise }, {
        filename: 'pages/confirm-auth.js'
    });
    listeners.DOMContentLoaded();

    return {
        elements,
        verifyOtp,
        appendedScripts,
        window,
        click: () => listeners.click?.()
    };
}

describe('email confirmation landing page', () => {
    const base = 'https://sicxz.github.io/program-command/confirm-auth.html';

    test('prefetching the page leaves the token unused and removes it from the address bar', () => {
        const page = openConfirmationPage(`${base}?type=recovery&token_hash=secret-hash`, {
            lazyLoad: true
        });

        expect(page.verifyOtp).not.toHaveBeenCalled();
        expect(page.appendedScripts).toEqual([]);
        expect(page.window.history.replaceState).toHaveBeenCalledWith(
            null, '', '/program-command/confirm-auth.html'
        );
        expect(page.elements.confirmHeading.textContent).toBe('Reset your password');
    });

    test.each(['recovery', 'invite'])(
        'verifies a %s token only after a click and opens the password form',
        async (type) => {
            const page = openConfirmationPage(`${base}?type=${type}&token_hash=secret-hash`);

            await page.click();

            expect(page.verifyOtp).toHaveBeenCalledTimes(1);
            expect(page.verifyOtp).toHaveBeenCalledWith({
                token_hash: 'secret-hash', type
            });
            expect(page.window.location.replace).toHaveBeenCalledWith(`login.html?type=${type}`);
        }
    );

    test('loads Supabase only after the button click', async () => {
        const page = openConfirmationPage(`${base}?type=invite&token_hash=secret-hash`, {
            lazyLoad: true
        });

        expect(page.appendedScripts).toEqual([]);
        await page.click();

        expect(page.appendedScripts).toEqual([
            'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
            'js/supabase-config.js'
        ]);
        expect(page.verifyOtp).toHaveBeenCalledTimes(1);
    });

    test('ignores repeated clicks while verification is in progress', async () => {
        const page = openConfirmationPage(`${base}?type=recovery&token_hash=secret-hash`);
        let finishVerification;
        page.verifyOtp.mockReturnValue(new Promise((resolve) => {
            finishVerification = resolve;
        }));

        const firstClick = page.click();
        const secondClick = page.click();
        await Promise.resolve();

        expect(page.verifyOtp).toHaveBeenCalledTimes(1);
        finishVerification({ data: { session: { access_token: 'test-session' } }, error: null });
        await Promise.all([firstClick, secondClick]);
    });

    test('keeps the user on the page when verification fails', async () => {
        const page = openConfirmationPage(`${base}?type=recovery&token_hash=used-hash`, {
            verifyOtpResult: { data: { session: null }, error: new Error('expired') }
        });

        await page.click();

        expect(page.window.location.replace).not.toHaveBeenCalled();
        expect(page.elements.confirmButton.disabled).toBe(false);
        expect(page.elements.confirmError.hidden).toBe(false);
        expect(page.elements.confirmError.textContent).toMatch(/request a new one/);
    });

    test.each([
        `${base}?type=magiclink&token_hash=secret-hash`,
        `${base}?type=recovery`
    ])('rejects incomplete or unsupported email links', (url) => {
        const page = openConfirmationPage(url);

        expect(page.elements.confirmButton.disabled).toBe(true);
        expect(page.elements.confirmError.hidden).toBe(false);
        expect(page.verifyOtp).not.toHaveBeenCalled();
    });

    test.each(['recovery', 'invite'])(
        'the existing login page shows Create your password for %s after a session is established',
        async (type) => {
            const elements = Object.fromEntries([
                'loginHeading', 'loginForm', 'resetForm', 'setPasswordForm',
                'loginError', 'loginMessage', 'newPassword'
            ].map((id) => [id, {
                hidden: id === 'setPasswordForm',
                style: {},
                textContent: '',
                addEventListener: jest.fn(),
                focus: jest.fn()
            }]));
            const handlers = {};
            const document = {
                addEventListener(event, handler) {
                    handlers[event] = handler;
                },
                getElementById(id) {
                    return elements[id] || null;
                },
                querySelector() {
                    return { hidden: false };
                }
            };
            const window = {
                location: { search: `?type=${type}`, hash: '', replace: jest.fn() },
                AuthService: {
                    getAuthRedirectType: () => type,
                    getSession: async () => ({ access_token: 'test-session' })
                }
            };

            vm.runInNewContext(loginScript, { document, window, URLSearchParams }, {
                filename: 'pages/login.js'
            });
            await handlers.DOMContentLoaded();

            expect(elements.setPasswordForm.hidden).toBe(false);
            expect(elements.loginHeading.textContent).toBe('Create your password');
            expect(elements.newPassword.focus).toHaveBeenCalledTimes(1);
            expect(window.location.replace).not.toHaveBeenCalled();
        }
    );
});
