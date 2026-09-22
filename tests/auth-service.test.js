const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadAuthService({ isConfigured = true, authImpl = {} } = {}) {
    const filePath = path.resolve(__dirname, '..', 'js/auth-service.js');
    const source = fs.readFileSync(filePath, 'utf8');

    const mockAuth = {
        signInWithPassword: jest.fn(),
        resetPasswordForEmail: jest.fn(),
        updateUser: jest.fn(),
        signOut: jest.fn(),
        getSession: jest.fn(),
        getUser: jest.fn(),
        onAuthStateChange: jest.fn(),
        ...authImpl
    };

    const mockClient = { auth: mockAuth };
    const mockDocument = {
        addEventListener: jest.fn()
    };

    const sandbox = {
        console,
        URL,
        URLSearchParams,
        module: { exports: {} },
        exports: {},
        document: mockDocument,
        window: {
            location: {
                origin: 'https://program-command.example',
                search: '',
                hash: ''
            },
            getSupabaseClient: jest.fn(() => mockClient),
            isSupabaseConfigured: jest.fn(() => isConfigured)
        },
        getSupabaseClient: jest.fn(() => mockClient),
        isSupabaseConfigured: jest.fn(() => isConfigured)
    };

    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'js/auth-service.js' });

    return {
        AuthService: sandbox.module.exports,
        mockAuth,
        mockClient
    };
}

describe('AuthService', () => {
    test('requestPasswordReset sends a login-page redirect URL', async () => {
        const { AuthService, mockAuth } = loadAuthService();
        mockAuth.resetPasswordForEmail.mockResolvedValue({
            data: {},
            error: null
        });

        await AuthService.requestPasswordReset('chair@example.edu');

        expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledWith(
            'chair@example.edu',
            { redirectTo: expect.stringMatching(/login\.html$/) }
        );
    });

    test('updatePassword updates the current user password', async () => {
        const { AuthService, mockAuth } = loadAuthService();
        mockAuth.updateUser.mockResolvedValue({ data: {}, error: null });

        await AuthService.updatePassword('a-secure-password');

        expect(mockAuth.updateUser).toHaveBeenCalledWith({
            password: 'a-secure-password'
        });
    });

    test('signIn authenticates and returns session + user role', async () => {
        const { AuthService, mockAuth } = loadAuthService();
        mockAuth.signInWithPassword.mockResolvedValue({
            data: {
                user: {
                    id: 'user-2',
                    email: 'admin@example.edu',
                    app_metadata: { role: 'admin' }
                },
                session: { access_token: 'abc' }
            },
            error: null
        });

        const result = await AuthService.signIn('admin@example.edu', 'secret');

        expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({
            email: 'admin@example.edu',
            password: 'secret'
        });
        expect(result.user.role).toBe('admin');
        expect(result.session).toEqual({ access_token: 'abc' });
    });

    test('getSession returns null when no active session exists', async () => {
        const { AuthService, mockAuth } = loadAuthService();
        mockAuth.getSession.mockResolvedValue({
            data: { session: null },
            error: null
        });

        await expect(AuthService.getSession()).resolves.toBeNull();
    });

    test('getUser returns normalized user with role', async () => {
        const { AuthService, mockAuth } = loadAuthService();
        mockAuth.getUser.mockResolvedValue({
            data: {
                user: {
                    id: 'user-3',
                    email: 'chair2@example.edu',
                    raw_user_meta_data: { role: 'chair' }
                }
            },
            error: null
        });

        const user = await AuthService.getUser();
        expect(user.role).toBe('chair');
        expect(user.email).toBe('chair2@example.edu');
    });

    test('onAuthStateChange subscribes and forwards normalized payload', () => {
        const { AuthService, mockAuth } = loadAuthService();
        const subscription = { unsubscribe: jest.fn() };

        mockAuth.onAuthStateChange.mockImplementation((handler) => {
            handler('SIGNED_IN', {
                access_token: 'xyz',
                user: { id: 'user-4', user_metadata: { role: 'chair' } }
            });
            return { data: { subscription }, error: null };
        });

        const callback = jest.fn();
        const result = AuthService.onAuthStateChange(callback);

        expect(result).toBe(subscription);
        expect(callback).toHaveBeenCalledWith(
            'SIGNED_IN',
            expect.objectContaining({
                access_token: 'xyz',
                user: expect.objectContaining({ role: 'chair' })
            }),
            expect.objectContaining({ role: 'chair' })
        );
    });

    test('can(action, resource) enforces chair permissions from auth contract', () => {
        const { AuthService } = loadAuthService();

        expect(AuthService.can('write', 'schedule', { role: 'chair' })).toBe(true);
        expect(AuthService.can('read', 'system-config', { role: 'chair' })).toBe(true);
        expect(AuthService.can('write', 'system-config', { role: 'chair' })).toBe(false);
        expect(AuthService.can('manage', 'accounts', { role: 'chair' })).toBe(false);
    });

    test('can(action, resource) grants full access for admin role', () => {
        const { AuthService } = loadAuthService();

        expect(AuthService.can('read', 'departments', { role: 'admin' })).toBe(true);
        expect(AuthService.can('write', 'system-config', { role: 'admin' })).toBe(true);
        expect(AuthService.can('manage', 'accounts', { role: 'admin' })).toBe(true);
        expect(AuthService.can('delete', 'unknown-resource', { role: 'admin' })).toBe(true);
    });

    test('can(action, resource) uses cached role when context is omitted', async () => {
        const { AuthService, mockAuth } = loadAuthService();
        mockAuth.signInWithPassword.mockResolvedValue({
            data: {
                user: {
                    id: 'user-5',
                    email: 'admin@example.edu',
                    app_metadata: { role: 'admin' }
                },
                session: { access_token: 'admin-token' }
            },
            error: null
        });

        await AuthService.signIn('admin@example.edu', 'secret');
        expect(AuthService.can('manage', 'accounts')).toBe(true);
    });

    test('throws when Supabase is not configured for auth operations', async () => {
        const { AuthService } = loadAuthService({ isConfigured: false });
        await expect(AuthService.signIn('chair@example.edu', 'pw')).rejects.toThrow('Supabase is not configured.');
        await expect(AuthService.getSession()).resolves.toBeNull();
        await expect(AuthService.getUser()).resolves.toBeNull();
    });
});
