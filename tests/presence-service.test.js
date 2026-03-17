const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createHarness({
    user = { id: 'user-self', email: 'self@example.edu', role: 'chair' },
    fallbackAuthUser = null,
    subscribeStatus = 'SUBSCRIBED'
} = {}) {
    const source = fs.readFileSync(path.resolve(__dirname, '..', 'js/presence-service.js'), 'utf8');

    let presenceState = {};
    const handlers = {};

    const channel = {
        on: jest.fn((type, filter, callback) => {
            handlers[`${type}:${filter.event}`] = callback;
            return channel;
        }),
        subscribe: jest.fn((callback) => {
            callback(subscribeStatus);
            return channel;
        }),
        track: jest.fn().mockResolvedValue({}),
        send: jest.fn().mockResolvedValue('ok'),
        untrack: jest.fn(),
        unsubscribe: jest.fn(),
        presenceState: jest.fn(() => presenceState)
    };

    const client = {
        channel: jest.fn(() => channel),
        removeChannel: jest.fn(),
        auth: {
            getUser: jest.fn().mockResolvedValue({
                data: {
                    user: fallbackAuthUser
                        || (user
                            ? {
                                id: user.id,
                                email: user.email,
                                user_metadata: { role: user.role },
                                app_metadata: { role: user.role }
                            }
                            : null)
                },
                error: null
            })
        }
    };

    const sandboxWindow = {
        AuthService: {
            getUser: jest.fn().mockResolvedValue(user)
        },
        getSupabaseClient: jest.fn(() => client),
        addEventListener: jest.fn()
    };

    const sandbox = {
        console,
        module: { exports: {} },
        exports: {},
        window: sandboxWindow,
        getSupabaseClient: jest.fn(() => client),
        crypto: { randomUUID: () => 'session-1' },
        setInterval,
        clearInterval,
        setTimeout,
        clearTimeout,
        Date,
        Math
    };

    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'js/presence-service.js' });

    return {
        PresenceService: sandbox.module.exports,
        channel,
        client,
        handlers,
        setPresenceState(next) {
            presenceState = next;
        }
    };
}

describe('PresenceService', () => {
    test('joinPage subscribes to Supabase presence and tracks the current user', async () => {
        const { PresenceService, channel, client } = createHarness();

        await expect(PresenceService.joinPage('/index.html')).resolves.toBe(true);

        expect(client.channel).toHaveBeenCalledTimes(1);
        expect(client.channel.mock.calls[0][0]).toContain('pc-presence:');
        expect(channel.subscribe).toHaveBeenCalledTimes(1);
        expect(channel.track).toHaveBeenCalled();
    });

    test('getActiveEditors filters stale sessions and returns normalized editors', async () => {
        const { PresenceService, handlers, setPresenceState } = createHarness();

        await PresenceService.joinPage('/index.html');

        const now = new Date().toISOString();
        const stale = new Date(Date.now() - 120000).toISOString();

        setPresenceState({
            'user-a:session-a': [{
                user_id: 'user-a',
                user_email: 'a@example.edu',
                role: 'chair',
                joined_at: now,
                last_seen: now,
                session_id: 'session-a'
            }],
            'user-b:session-b': [{
                user_id: 'user-b',
                user_email: 'b@example.edu',
                role: 'admin',
                joined_at: stale,
                last_seen: stale,
                session_id: 'session-b'
            }]
        });

        handlers['presence:sync']();

        const editors = PresenceService.getActiveEditors('/index.html');
        expect(editors).toHaveLength(1);
        expect(editors[0]).toMatchObject({
            userId: 'user-a',
            user: 'a@example.edu',
            role: 'chair'
        });
    });

    test('onPresenceChange subscribes callbacks and supports unsubscribe', async () => {
        const { PresenceService, handlers, setPresenceState } = createHarness();
        const callback = jest.fn();

        const unsubscribe = PresenceService.onPresenceChange('/index.html', callback);
        await new Promise((resolve) => setTimeout(resolve, 0));

        setPresenceState({
            'user-a:session-a': [{
                user_id: 'user-a',
                user_email: 'a@example.edu',
                role: 'chair',
                joined_at: new Date().toISOString(),
                last_seen: new Date().toISOString(),
                session_id: 'session-a'
            }]
        });
        handlers['presence:sync']();

        expect(callback).toHaveBeenCalled();
        const callsAfterSync = callback.mock.calls.length;

        unsubscribe();
        handlers['presence:sync']();
        expect(callback.mock.calls.length).toBe(callsAfterSync);
    });

    test('leavePage clears channel resources', async () => {
        const { PresenceService, channel, client } = createHarness();

        await PresenceService.joinPage('/index.html');
        PresenceService.leavePage('/index.html');

        expect(channel.untrack).toHaveBeenCalled();
        expect(channel.unsubscribe).toHaveBeenCalled();
        expect(client.removeChannel).toHaveBeenCalled();
    });

    test('announceSave broadcasts save notice and onSaveNotice receives it', async () => {
        const { PresenceService, handlers, channel } = createHarness();
        const callback = jest.fn();

        const unsubscribe = PresenceService.onSaveNotice('/index.html', callback);
        await new Promise((resolve) => setTimeout(resolve, 0));

        await PresenceService.announceSave('/index.html', {
            user_id: 'user-self',
            user_label: 'self@example.edu'
        });

        expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
            type: 'broadcast',
            event: 'save-notice',
            payload: expect.objectContaining({
                user_id: 'user-self',
                user_label: 'self@example.edu'
            })
        }));

        handlers['broadcast:save-notice']({
            payload: {
                user_id: 'user-a',
                user_label: 'a@example.edu',
                sent_at: new Date().toISOString()
            }
        });

        expect(callback).toHaveBeenCalledWith(expect.objectContaining({
            user_id: 'user-a',
            user_label: 'a@example.edu'
        }));

        unsubscribe();
    });

    test('joinPage returns false when no authenticated user is available', async () => {
        const { PresenceService, channel, client } = createHarness({
            user: null,
            fallbackAuthUser: null
        });

        await expect(PresenceService.joinPage('/index.html')).resolves.toBe(false);
        expect(channel.subscribe).not.toHaveBeenCalled();
        expect(client.auth.getUser).toHaveBeenCalledTimes(1);
    });

    test('joinPage rejects when realtime channel returns CHANNEL_ERROR', async () => {
        const { PresenceService } = createHarness({
            subscribeStatus: 'CHANNEL_ERROR'
        });

        await expect(PresenceService.joinPage('/index.html')).rejects.toThrow(
            'Presence subscribe failed for /index.html: CHANNEL_ERROR'
        );
    });

    test('announceSave returns false when presence join cannot complete', async () => {
        const { PresenceService, channel } = createHarness({
            user: null,
            fallbackAuthUser: null
        });

        await expect(PresenceService.announceSave('/index.html', { user_id: 'x' })).resolves.toBe(false);
        expect(channel.send).not.toHaveBeenCalled();
    });
});
