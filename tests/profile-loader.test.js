const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadProfileLoader({
    supabaseRow = null,
    supabaseError = null,
    authUser = null,
    includeDepartmentProfileManager = false
} = {}) {
    const filePath = path.resolve(__dirname, '..', 'js/profile-loader.js');
    const source = fs.readFileSync(filePath, 'utf8');

    const query = {
        select: jest.fn(function select() { return this; }),
        eq: jest.fn(function eq() { return this; }),
        maybeSingle: jest.fn().mockResolvedValue({ data: supabaseRow, error: supabaseError })
    };

    const client = {
        from: jest.fn(() => query)
    };

    const windowObject = {
        getSupabaseClient: jest.fn(() => client),
        AuthService: {
            getUser: jest.fn().mockResolvedValue(authUser)
        }
    };

    if (includeDepartmentProfileManager) {
        windowObject.DepartmentProfileManager = {
            getDefaultProfile: jest.fn(() => ({
                id: 'runtime-default',
                workload: {
                    defaultAnnualTargets: { 'Full Professor': 36 }
                },
                faculty: {
                    ranks: {
                        professor: { limit: 36 }
                    }
                }
            }))
        };
    }

    const sandbox = {
        window: windowObject,
        getSupabaseClient: jest.fn(() => client),
        module: { exports: {} },
        exports: {},
        console
    };

    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'js/profile-loader.js' });

    return {
        ProfileLoader: sandbox.module.exports,
        query,
        client,
        windowObject
    };
}

describe('ProfileLoader', () => {
    test('falls back to default profile and supports nested path reads', async () => {
        const { ProfileLoader, windowObject } = loadProfileLoader({
            supabaseRow: null,
            supabaseError: { message: 'offline' }
        });

        windowObject.getSupabaseClient.mockReturnValue(null);
        const snapshot = await ProfileLoader.init();

        expect(snapshot.loaded).toBe(true);
        expect(ProfileLoader.isLoaded()).toBe(true);
        expect(ProfileLoader.get('faculty.ranks.professor.limit')).toBe(36);
        expect(ProfileLoader.get('does.not.exist', 'fallback')).toBe('fallback');
    });

    test('loads program config from supabase and caches by program id', async () => {
        const { ProfileLoader, query, client } = loadProfileLoader({
            supabaseRow: {
                id: 'program-1',
                code: 'ewu-design',
                config: {
                    workload: {
                        defaultAnnualTargets: {
                            'Full Professor': 40
                        }
                    }
                }
            }
        });

        const first = await ProfileLoader.init('program-1');
        const second = await ProfileLoader.init('program-1');

        expect(first.source).toBe('supabase-programs');
        expect(second.source).toBe('supabase-programs');
        expect(ProfileLoader.get('faculty.ranks.professor.limit')).toBe(40);
        expect(client.from).toHaveBeenCalledWith('programs');
        expect(query.maybeSingle).toHaveBeenCalledTimes(1);
    });

    test('can resolve program id from AuthService metadata when not passed explicitly', async () => {
        const { ProfileLoader, query, windowObject } = loadProfileLoader({
            supabaseRow: {
                id: 'program-auth',
                code: 'ewu-design',
                config: {}
            },
            authUser: {
                app_metadata: {
                    program_id: 'program-auth'
                }
            }
        });

        await ProfileLoader.init();

        expect(windowObject.AuthService.getUser).toHaveBeenCalledTimes(1);
        expect(query.eq).toHaveBeenCalledWith('id', 'program-auth');
    });
});
