const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadAuthService({ isConfigured = true, authImpl = {} } = {}) {
    const filePath = path.resolve(__dirname, '..', 'js/auth-service.js');
    const source = fs.readFileSync(filePath, 'utf8');

    const mockAuth = {
        signUp: jest.fn(),
        signInWithPassword: jest.fn(),
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
        module: { exports: {} },
        exports: {},
        document: mockDocument,
        window: {
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
    test('signUp stores role metadata and returns normalized role', async () => {
        const { AuthService, mockAuth } = loadAuthService();
        mockAuth.signUp.mockResolvedValue({
            data: {
                user: {
                    id: 'user-1',
                    email: 'chair@example.edu',
                    user_metadata: { role: 'chair' }
                },
                session: { access_token: 'token' }
            },
            error: null
        });

        const result = await AuthService.signUp('chair@example.edu', 'password123', 'chair');

        expect(mockAuth.signUp).toHaveBeenCalledWith({
            email: 'chair@example.edu',
            password: 'password123',
            options: { data: { role: 'chair' } }
        });
        expect(result.role).toBe('chair');
        expect(result.user.role).toBe('chair');
        expect(result.session).toEqual({ access_token: 'token' });
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

    test('throws when Supabase is not configured for auth operations', async () => {
        const { AuthService } = loadAuthService({ isConfigured: false });
        await expect(AuthService.signIn('chair@example.edu', 'pw')).rejects.toThrow('Supabase is not configured.');
        await expect(AuthService.signUp('chair@example.edu', 'pw', 'chair')).rejects.toThrow('Supabase is not configured.');
        await expect(AuthService.getSession()).resolves.toBeNull();
        await expect(AuthService.getUser()).resolves.toBeNull();
    });
});
