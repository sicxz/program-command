const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('supabase environment selection', () => {
    function loadConfigWithLocation({ search = '', locationFallback = null, localStorageValue = null } = {}) {
        jest.resetModules();

        const originalLocation = global.location;
        const originalProgramEnv = global.__PROGRAM_COMMAND_SUPABASE_ENV__;

        window.history.replaceState({}, '', `http://localhost/${search}`);
        window.localStorage.removeItem('program-command.supabase-env');

        if (localStorageValue) {
            window.localStorage.setItem('program-command.supabase-env', localStorageValue);
        }

        if (locationFallback) {
            global.location = locationFallback;
        } else {
            global.location = window.location;
        }

        const config = require('../js/supabase-config.js');

        return {
            config,
            restore() {
                window.history.replaceState({}, '', 'http://localhost/');
                window.localStorage.removeItem('program-command.supabase-env');
                if (originalProgramEnv === undefined) {
                    delete global.__PROGRAM_COMMAND_SUPABASE_ENV__;
                } else {
                    global.__PROGRAM_COMMAND_SUPABASE_ENV__ = originalProgramEnv;
                }
                global.location = originalLocation;
            }
        };
    }

    test('defaults to develop on localhost', () => {
        const { config, restore } = loadConfigWithLocation();

        try {
            expect(config.inferDefaultSupabaseEnvironment()).toBe('develop');
            expect(config.getSupabaseEnvironmentName()).toBe('develop');
            expect(config.getSupabaseConfigSnapshot()).toEqual({
                environment: 'develop',
                url: 'https://cstcwplvioheazoghkgf.supabase.co',
                departmentCode: 'DESN'
            });
        } finally {
            restore();
        }
    });

    test('uses query-string override when provided', () => {
        const { config, restore } = loadConfigWithLocation({
            search: '?supabaseEnv=production'
        });

        try {
            expect(config.getSupabaseEnvironmentName()).toBe('production');
            expect(config.getSupabaseUrl()).toBe('https://ohnrhjxcjkrdtudpzjgn.supabase.co');
        } finally {
            restore();
        }
    });

    test('uses stored override when present', () => {
        const { config, restore } = loadConfigWithLocation({
            localStorageValue: 'production'
        });

        try {
            expect(config.getSupabaseEnvironmentName()).toBe('production');
        } finally {
            restore();
        }
    });

    test('falls back to production on non-local hosts', () => {
        const source = fs.readFileSync(
            path.resolve(__dirname, '..', 'js', 'supabase-config.js'),
            'utf8'
        );

        const sandbox = {
            console,
            location: {
                hostname: 'program-command.app',
                search: ''
            },
            URLSearchParams,
            module: { exports: {} },
            exports: {}
        };

        try {
            vm.createContext(sandbox);
            vm.runInContext(source, sandbox, { filename: 'js/supabase-config.js' });
            const config = sandbox.module.exports;
            expect(config.inferDefaultSupabaseEnvironment()).toBe('production');
            expect(config.getSupabaseEnvironmentName()).toBe('production');
        } finally {
            delete sandbox.location;
        }
    });
});
