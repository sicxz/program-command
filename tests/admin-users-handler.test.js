/**
 * @jest-environment node
 */
const path = require('path');

const { handle } = require(path.join(__dirname, '..', 'supabase', 'functions', 'admin-users', 'handler.js'));

const ADMIN = { id: 'admin-1', email: 'admin@ewu.edu' };
const REDIRECT = 'https://sicxz.github.io/program-command/login.html';

function createFakeClient({ profiles = [], authUsers = [] } = {}) {
    const calls = {
        invite: [],
        deleteUser: [],
        profileUpserts: [],
        profileUpdates: [],
        editorUpserts: [],
        editorDeletes: []
    };
    const profileRows = profiles.map((row) => ({ ...row }));

    function userProfilesTable() {
        return {
            select() {
                return {
                    eq(_column, id) {
                        return {
                            maybeSingle: async () => ({
                                data: profileRows.find((row) => row.id === id) || null,
                                error: null
                            })
                        };
                    },
                    then(resolve, reject) {
                        return Promise.resolve({ data: profileRows, error: null }).then(resolve, reject);
                    }
                };
            },
            upsert: async (row) => {
                calls.profileUpserts.push(row);
                return { data: null, error: null };
            },
            update(values) {
                return {
                    eq(_column, id) {
                        return {
                            select() {
                                return {
                                    single: async () => {
                                        calls.profileUpdates.push({ id, ...values });
                                        const row = profileRows.find((item) => item.id === id);
                                        if (!row) return { data: null, error: { message: 'not found' } };
                                        Object.assign(row, values);
                                        return { data: { ...row }, error: null };
                                    }
                                };
                            }
                        };
                    }
                };
            }
        };
    }

    function editorsTable() {
        return {
            upsert: async (row) => {
                calls.editorUpserts.push(row);
                return { data: null, error: null };
            },
            delete() {
                return {
                    eq: async (_column, userId) => {
                        calls.editorDeletes.push(userId);
                        return { data: null, error: null };
                    }
                };
            }
        };
    }

    const client = {
        from(table) {
            if (table === 'user_profiles') return userProfilesTable();
            if (table === 'editors') return editorsTable();
            throw new Error(`Unexpected table ${table}`);
        },
        auth: {
            admin: {
                listUsers: async () => ({ data: { users: authUsers }, error: null }),
                inviteUserByEmail: async (email, options) => {
                    calls.invite.push({ email, options });
                    return { data: { user: { id: 'new-user', email } }, error: null };
                },
                deleteUser: async (userId) => {
                    calls.deleteUser.push(userId);
                    return { data: {}, error: null };
                }
            }
        }
    };
    return { client, calls };
}

function adminDeps(overrides = {}) {
    const fake = createFakeClient({
        profiles: [
            { id: ADMIN.id, email: ADMIN.email, role: 'admin' },
            { id: 'user-2', email: 'member@ewu.edu', role: 'participant' },
            ...(overrides.profiles || [])
        ],
        authUsers: overrides.authUsers || []
    });
    return {
        fake,
        deps: {
            adminClient: fake.client,
            getCaller: async () => ({ user: ADMIN }),
            inviteRedirectUrl: REDIRECT
        }
    };
}

function post(body, headers = {}) {
    return new Request('https://example.supabase.co/functions/v1/admin-users', {
        method: 'POST',
        headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
            ...headers
        },
        body: JSON.stringify(body)
    });
}

describe('admin-users handler: CORS and method', () => {
    test('OPTIONS answers 204 with allow-origin for an allowed origin', async () => {
        const request = new Request('https://example.test/', {
            method: 'OPTIONS',
            headers: { Origin: 'https://sicxz.github.io' }
        });
        const response = await handle(request, {});
        expect(response.status).toBe(204);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://sicxz.github.io');
        expect(response.headers.get('Access-Control-Allow-Headers'))
            .toBe('authorization, x-client-info, apikey, content-type');
        expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
    });

    test('OPTIONS from another origin gets no allow-origin header', async () => {
        const request = new Request('https://example.test/', {
            method: 'OPTIONS',
            headers: { Origin: 'https://evil.example' }
        });
        const response = await handle(request, {});
        expect(response.status).toBe(204);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    test('GET is 405', async () => {
        const { deps } = adminDeps();
        const response = await handle(new Request('https://example.test/', { method: 'GET' }), deps);
        expect(response.status).toBe(405);
    });
});

describe('admin-users handler: authorization', () => {
    test('no caller gives 401', async () => {
        const { deps } = adminDeps();
        deps.getCaller = async () => ({ user: null });
        const response = await handle(post({ action: 'list' }), deps);
        expect(response.status).toBe(401);
    });

    test('participant caller gives 403', async () => {
        const { deps } = adminDeps();
        deps.getCaller = async () => ({ user: { id: 'user-2', email: 'member@ewu.edu' } });
        const response = await handle(post({ action: 'list' }), deps);
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'Administrator access is required.' });
    });
});

describe('admin-users handler: actions', () => {
    test('list joins profiles and marks invited vs active', async () => {
        const { deps } = adminDeps({
            authUsers: [
                { id: ADMIN.id, email: ADMIN.email, email_confirmed_at: '2026-01-01', last_sign_in_at: '2026-09-01' },
                { id: 'user-2', email: 'member@ewu.edu', email_confirmed_at: null },
                { id: 'user-3', email: 'noprofile@ewu.edu', email_confirmed_at: '2026-02-02' }
            ]
        });
        const response = await handle(post({ action: 'list' }), deps);
        expect(response.status).toBe(200);
        const { users } = await response.json();
        const byId = Object.fromEntries(users.map((user) => [user.id, user]));
        expect(byId[ADMIN.id]).toEqual({
            id: ADMIN.id, email: ADMIN.email, role: 'admin', status: 'active', lastSignInAt: '2026-09-01'
        });
        expect(byId['user-2']).toMatchObject({ role: 'participant', status: 'invited' });
        expect(byId['user-3']).toMatchObject({ role: 'none', status: 'active' });
    });

    test('invite rejects a bad email and a bad role', async () => {
        const { deps, fake } = adminDeps();
        const badEmail = await handle(post({ action: 'invite', email: 'not-an-email', role: 'admin' }), deps);
        expect(badEmail.status).toBe(400);
        const badRole = await handle(post({ action: 'invite', email: 'a@ewu.edu', role: 'owner' }), deps);
        expect(badRole.status).toBe(400);
        expect(fake.calls.invite).toHaveLength(0);
    });

    test('invite passes the redirect URL, upserts the profile, and adds admins to editors', async () => {
        const { deps, fake } = adminDeps();
        const response = await handle(post({ action: 'invite', email: 'New@EWU.edu', role: 'admin' }), deps);
        expect(response.status).toBe(201);
        expect(fake.calls.invite).toEqual([{ email: 'new@ewu.edu', options: { redirectTo: REDIRECT } }]);
        expect(fake.calls.profileUpserts).toEqual([
            { id: 'new-user', email: 'new@ewu.edu', role: 'admin', invited_by: ADMIN.id }
        ]);
        expect(fake.calls.editorUpserts).toEqual([
            { user_id: 'new-user', email: 'new@ewu.edu', role: 'editor', added_by: ADMIN.id }
        ]);
    });

    test('setRole participant removes from editors; admin adds', async () => {
        const { deps, fake } = adminDeps();
        const demote = await handle(post({ action: 'setRole', userId: 'user-2', role: 'participant' }), deps);
        expect(demote.status).toBe(200);
        expect(fake.calls.editorDeletes).toEqual(['user-2']);

        const promote = await handle(post({ action: 'setRole', userId: 'user-2', role: 'admin' }), deps);
        expect(promote.status).toBe(200);
        expect(fake.calls.editorUpserts).toEqual([
            { user_id: 'user-2', email: 'member@ewu.edu', role: 'editor', added_by: ADMIN.id }
        ]);
        expect(fake.calls.profileUpdates.map((update) => update.role)).toEqual(['participant', 'admin']);
    });

    test('setRole and remove on self give 400', async () => {
        const { deps, fake } = adminDeps();
        const message = 'You cannot change or remove your own administrator account.';
        const setSelf = await handle(post({ action: 'setRole', userId: ADMIN.id, role: 'participant' }), deps);
        expect(setSelf.status).toBe(400);
        expect(await setSelf.json()).toEqual({ error: message });
        const removeSelf = await handle(post({ action: 'remove', userId: ADMIN.id }), deps);
        expect(removeSelf.status).toBe(400);
        expect(await removeSelf.json()).toEqual({ error: message });
        expect(fake.calls.deleteUser).toHaveLength(0);
        expect(fake.calls.profileUpdates).toHaveLength(0);
    });

    test('remove calls deleteUser', async () => {
        const { deps, fake } = adminDeps();
        const response = await handle(post({ action: 'remove', userId: 'user-2' }), deps);
        expect(response.status).toBe(200);
        expect(fake.calls.deleteUser).toEqual(['user-2']);
    });
});
