const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SESSION_RECOVERY_DRAFT_KEY = 'pc_session_recovery_draft_v1';

function flushPromises() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function createLocation(url) {
    const parsed = new URL(url);
    return {
        pathname: parsed.pathname,
        hostname: parsed.hostname,
        search: parsed.search,
        hash: parsed.hash,
        replace: jest.fn()
    };
}

function loadAuthGuardHarness({
    url = 'https://program-command.local/index.html',
    session = { user: { id: 'user-self' } },
    user = { id: 'user-self', email: 'self@example.edu', role: 'chair' },
    canResult = true,
    presenceService = null
} = {}) {
    const source = fs.readFileSync(path.resolve(__dirname, '..', 'js/auth-guard.js'), 'utf8');

    document.head.innerHTML = '';
    document.body.innerHTML = `
        <button id="editAction">Edit</button>
        <button id="saveAction">Save</button>
    `;

    const domReadyHandlers = [];
    const originalDocumentAddEventListener = document.addEventListener.bind(document);
    const documentAddEventListenerSpy = jest
        .spyOn(document, 'addEventListener')
        .mockImplementation((eventName, handler, options) => {
            if (eventName === 'DOMContentLoaded') {
                domReadyHandlers.push(handler);
                return;
            }
            return originalDocumentAddEventListener(eventName, handler, options);
        });

    const location = createLocation(url);
    const listeners = {};

    const authService = {
        getSession: jest.fn().mockResolvedValue(session),
        getUser: jest.fn().mockResolvedValue(user),
        signOut: jest.fn().mockResolvedValue(true),
        can: jest.fn(() => canResult)
    };

    const sandboxWindow = {
        location,
        AuthService: authService,
        PresenceService: presenceService,
        addEventListener: jest.fn((eventName, handler) => {
            listeners[eventName] = handler;
        }),
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        URLSearchParams
    };
    sandboxWindow.document = document;

    const sandbox = {
        window: sandboxWindow,
        document,
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        URLSearchParams,
        module: { exports: {} },
        exports: {}
    };

    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'js/auth-guard.js' });

    return {
        authService,
        listeners,
        location,
        triggerDomReady: async () => {
            expect(domReadyHandlers.length).toBeGreaterThan(0);
            await domReadyHandlers[0]();
            await flushPromises();
        },
        cleanup: () => {
            documentAddEventListenerSpy.mockRestore();
        }
    };
}

function loadLoginHarness({
    url = 'https://program-command.local/login.html?timeout=1&next=%2Findex.html',
    authService
} = {}) {
    const source = fs.readFileSync(path.resolve(__dirname, '..', 'pages/login.js'), 'utf8');

    document.head.innerHTML = '';
    document.body.innerHTML = `
        <div id="loginError" style="display:none"></div>
        <form id="loginForm">
            <input id="loginEmail" />
            <input id="loginPassword" />
            <button id="loginButton" type="submit">Sign in</button>
        </form>
    `;

    const domReadyHandlers = [];
    const originalDocumentAddEventListener = document.addEventListener.bind(document);
    const documentAddEventListenerSpy = jest
        .spyOn(document, 'addEventListener')
        .mockImplementation((eventName, handler, options) => {
            if (eventName === 'DOMContentLoaded') {
                domReadyHandlers.push(handler);
                return;
            }
            return originalDocumentAddEventListener(eventName, handler, options);
        });

    const location = createLocation(url);
    const service = authService || {
        getSession: jest.fn().mockResolvedValue(null),
        signIn: jest.fn().mockResolvedValue({ user: { id: 'u1' } })
    };

    const sandboxWindow = {
        location,
        AuthService: service,
        confirm: jest.fn(() => true),
        localStorage,
        setTimeout,
        clearTimeout,
        URLSearchParams
    };
    sandboxWindow.document = document;

    const sandbox = {
        window: sandboxWindow,
        document,
        localStorage,
        console,
        setTimeout,
        clearTimeout,
        URLSearchParams,
        module: { exports: {} },
        exports: {}
    };

    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'pages/login.js' });

    return {
        authService: service,
        window: sandboxWindow,
        location,
        triggerDomReady: async () => {
            expect(domReadyHandlers.length).toBeGreaterThan(0);
            await domReadyHandlers[0]();
            await flushPromises();
        },
        submitCredentials: async ({ email, password }) => {
            document.getElementById('loginEmail').value = email;
            document.getElementById('loginPassword').value = password;
            const form = document.getElementById('loginForm');
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await flushPromises();
            await flushPromises();
        },
        cleanup: () => {
            documentAddEventListenerSpy.mockRestore();
        }
    };
}

describe('Auth + Edit State Integration', () => {
    afterEach(() => {
        localStorage.clear();
        document.head.innerHTML = '';
        document.body.innerHTML = '';
        jest.restoreAllMocks();
    });

    test('blocks chair users from admin-only onboarding route', async () => {
        const presenceService = {
            joinPage: jest.fn().mockResolvedValue(true),
            onPresenceChange: jest.fn(),
            onSaveNotice: jest.fn()
        };

        const harness = loadAuthGuardHarness({
            url: 'https://program-command.local/pages/department-onboarding.html',
            user: { id: 'chair-1', email: 'chair@example.edu', role: 'chair' },
            canResult: false,
            presenceService
        });

        await harness.triggerDomReady();

        expect(harness.authService.can).toHaveBeenCalledWith(
            'manage',
            'system-config',
            expect.objectContaining({ role: 'chair' })
        );
        expect(document.body.textContent).toContain('Access Denied');
        expect(document.body.textContent).toContain('only admins can access Department Onboarding');
        expect(presenceService.joinPage).not.toHaveBeenCalled();

        harness.cleanup();
    });

    test('presence callbacks toggle edit-lock mode for concurrent editors', async () => {
        let presenceCallback = null;
        const presenceService = {
            joinPage: jest.fn().mockResolvedValue(true),
            onPresenceChange: jest.fn((_pageId, callback) => {
                presenceCallback = callback;
                callback([]);
                return jest.fn();
            }),
            onSaveNotice: jest.fn(() => jest.fn()),
            leavePage: jest.fn()
        };

        const harness = loadAuthGuardHarness({
            url: 'https://program-command.local/index.html',
            user: { id: 'self-user', email: 'self@example.edu', role: 'chair' },
            canResult: true,
            presenceService
        });

        await harness.triggerDomReady();

        expect(document.getElementById('authSessionIndicator')).not.toBeNull();
        expect(presenceService.joinPage).toHaveBeenCalledWith('/index.html');
        expect(typeof presenceCallback).toBe('function');

        presenceCallback([
            {
                userId: 'other-user',
                user: 'other@example.edu',
                since: new Date().toISOString()
            }
        ]);

        expect(document.getElementById('editLockWarningBanner').style.display).toBe('flex');
        expect(document.getElementById('editAction').disabled).toBe(true);

        presenceCallback([]);
        expect(document.getElementById('editAction').disabled).toBe(false);

        harness.cleanup();
    });

    test('skips auth enforcement on localhost by default for dev flow', async () => {
        const harness = loadAuthGuardHarness({
            url: 'http://localhost:3000/pages/schedule-builder.html',
            session: null,
            user: null,
            canResult: false,
            presenceService: null
        });

        await harness.triggerDomReady();

        expect(harness.authService.getSession).not.toHaveBeenCalled();
        expect(harness.location.replace).not.toHaveBeenCalled();

        harness.cleanup();
    });

    test('login timeout flow restores recovery draft after successful sign-in', async () => {
        localStorage.setItem(SESSION_RECOVERY_DRAFT_KEY, JSON.stringify({
            academicYear: '2026-27',
            savedAt: '2026-02-28T20:00:00.000Z',
            scheduleData: { Fall: [{ id: 'course-1' }] }
        }));

        const harness = loadLoginHarness();
        await harness.triggerDomReady();

        expect(document.getElementById('loginError').textContent).toContain('session expired due to inactivity');

        await harness.submitCredentials({
            email: 'chair@example.edu',
            password: 'pw-123'
        });

        expect(harness.authService.signIn).toHaveBeenCalledWith('chair@example.edu', 'pw-123');
        expect(harness.window.confirm).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem(SESSION_RECOVERY_DRAFT_KEY)).toBeNull();

        const importedPayload = JSON.parse(localStorage.getItem('importedScheduleData'));
        expect(importedPayload).toMatchObject({
            academicYear: '2026-27',
            source: 'session-recovery-draft'
        });
        expect(importedPayload.scheduleData).toEqual({ Fall: [{ id: 'course-1' }] });
        expect(harness.location.replace).toHaveBeenCalledWith('/index.html');

        harness.cleanup();
    });
});
