const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const configPath = path.join(repoRoot, 'js', 'supabase-config.js');
const configSource = fs.readFileSync(configPath, 'utf8');

function createStorage(initialValues = {}) {
    const values = new Map(Object.entries(initialValues));

    return {
        getItem: jest.fn((key) => values.get(key) || null),
        setItem: jest.fn((key, value) => {
            values.set(key, String(value));
        }),
        removeItem: jest.fn((key) => {
            values.delete(key);
        })
    };
}

function runSupabaseConfig({
    href = 'http://127.0.0.1:3000/index.html',
    localStorageValues = {},
    sessionStorageValues = {},
    windowConfig = {}
} = {}) {
    const listeners = {};
    const supabaseSdk = {
        createClient: jest.fn((url, anonKey, options) => ({ url, anonKey, options }))
    };
    const currentLocation = new URL(href);
    const context = {
        URL,
        URLSearchParams,
        console: {
            log: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        },
        document: {
            addEventListener: jest.fn((eventName, callback) => {
                listeners[eventName] = callback;
            })
        },
        location: currentLocation,
        localStorage: createStorage(localStorageValues),
        sessionStorage: createStorage(sessionStorageValues),
        PROGRAM_COMMAND_SUPABASE_CONFIG: windowConfig,
        supabase: supabaseSdk
    };
    context.window = context;

    vm.runInNewContext(configSource, context, { filename: configPath });

    return { context, listeners, supabaseSdk };
}

describe('Supabase environment config', () => {
    test('localhost app pages default to the develop project and require a local key', () => {
        const { context, supabaseSdk } = runSupabaseConfig();

        expect(context.window.getSupabaseEnvironment()).toBe('develop');
        expect(context.window.getSupabaseEnvironmentConfig()).toMatchObject({
            name: 'develop',
            projectRef: 'cstcwplvioheazoghkgf',
            url: 'https://cstcwplvioheazoghkgf.supabase.co',
            anonKeyConfigured: false
        });
        expect(context.window.isSupabaseConfigured()).toBe(false);
        expect(context.window.initSupabase()).toBeNull();
        expect(supabaseSdk.createClient).not.toHaveBeenCalled();
    });

    test('the public schedule defaults to production even on localhost', () => {
        const { context, supabaseSdk } = runSupabaseConfig({
            href: 'http://127.0.0.1:3000/public-schedule.html'
        });

        const client = context.window.initSupabase();

        expect(context.window.getSupabaseEnvironment()).toBe('production');
        expect(context.window.getSupabaseEnvironmentConfig()).toMatchObject({
            name: 'production',
            projectRef: 'ohnrhjxcjkrdtudpzjgn',
            url: 'https://ohnrhjxcjkrdtudpzjgn.supabase.co',
            anonKeyConfigured: true
        });
        expect(client.url).toBe('https://ohnrhjxcjkrdtudpzjgn.supabase.co');
        expect(supabaseSdk.createClient).toHaveBeenCalledTimes(1);
    });

    test('localhost can override the develop anon key from browser storage', () => {
        const { context, supabaseSdk } = runSupabaseConfig({
            localStorageValues: {
                'programCommand.supabase.develop.anonKey': 'develop-anon-key'
            }
        });

        const client = context.window.initSupabase();

        expect(context.window.isSupabaseConfigured()).toBe(true);
        expect(client).toMatchObject({
            url: 'https://cstcwplvioheazoghkgf.supabase.co',
            anonKey: 'develop-anon-key'
        });
        expect(supabaseSdk.createClient).toHaveBeenCalledWith(
            'https://cstcwplvioheazoghkgf.supabase.co',
            'develop-anon-key',
            expect.objectContaining({
                auth: expect.objectContaining({
                    persistSession: true
                })
            })
        );
    });

    test('deployed hosts default to the production project', () => {
        const { context, supabaseSdk } = runSupabaseConfig({
            href: 'https://sicxz.github.io/program-command/public-schedule.html'
        });

        const client = context.window.initSupabase();

        expect(context.window.getSupabaseEnvironment()).toBe('production');
        expect(context.window.getSupabaseEnvironmentConfig()).toMatchObject({
            name: 'production',
            projectRef: 'ohnrhjxcjkrdtudpzjgn',
            url: 'https://ohnrhjxcjkrdtudpzjgn.supabase.co',
            anonKeyConfigured: true
        });
        expect(client.url).toBe('https://ohnrhjxcjkrdtudpzjgn.supabase.co');
        expect(supabaseSdk.createClient).toHaveBeenCalledTimes(1);
    });

    test('query params can force production while testing on localhost', () => {
        const { context } = runSupabaseConfig({
            href: 'http://127.0.0.1:3000/index.html?supabaseEnv=production'
        });

        expect(context.window.getSupabaseEnvironment()).toBe('production');
        expect(context.window.getSupabaseEnvironmentConfig()).toMatchObject({
            projectRef: 'ohnrhjxcjkrdtudpzjgn',
            url: 'https://ohnrhjxcjkrdtudpzjgn.supabase.co',
            anonKeyConfigured: true
        });
    });

    test('the browser helper persists local environment overrides', () => {
        const { context } = runSupabaseConfig();

        expect(context.window.ProgramCommandSupabase.setEnvironment('production')).toBe(true);
        expect(context.localStorage.setItem).toHaveBeenCalledWith(
            'programCommand.supabase.environment',
            'production'
        );

        expect(context.window.ProgramCommandSupabase.setDevelopAnonKey('develop-anon-key')).toBe(true);
        expect(context.localStorage.setItem).toHaveBeenCalledWith(
            'programCommand.supabase.develop.anonKey',
            'develop-anon-key'
        );
    });
});
