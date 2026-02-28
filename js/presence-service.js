/**
 * Presence Service
 * Tracks active editors per page using Supabase Realtime Presence.
 */
const PresenceService = (function() {
    'use strict';

    const CHANNEL_PREFIX = 'pc-presence:';
    const HEARTBEAT_MS = 10000;
    const STALE_TTL_MS = 30000;

    const pageStates = new Map();
    let unloadHandlerBound = false;

    const sessionId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    function sanitizePageId(pageId) {
        return String(pageId || '')
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^a-zA-Z0-9_\-/:.]/g, '_');
    }

    function getClient() {
        if (typeof getSupabaseClient === 'function') {
            return getSupabaseClient();
        }
        if (typeof window !== 'undefined' && typeof window.getSupabaseClient === 'function') {
            return window.getSupabaseClient();
        }
        return null;
    }

    async function resolveCurrentUser() {
        if (typeof window !== 'undefined' && window.AuthService && typeof window.AuthService.getUser === 'function') {
            try {
                const user = await window.AuthService.getUser();
                if (user?.id) {
                    return {
                        id: user.id,
                        email: user.email || user.user_metadata?.email || '',
                        role: user.role || user.user_metadata?.role || user.app_metadata?.role || 'chair'
                    };
                }
            } catch (error) {
                // fall through to direct Supabase lookup
            }
        }

        const client = getClient();
        if (!client?.auth || typeof client.auth.getUser !== 'function') {
            return null;
        }

        const { data, error } = await client.auth.getUser();
        if (error || !data?.user?.id) return null;
        return {
            id: data.user.id,
            email: data.user.email || data.user.user_metadata?.email || '',
            role: data.user.user_metadata?.role || data.user.app_metadata?.role || 'chair'
        };
    }

    function ensurePageState(pageId) {
        const key = sanitizePageId(pageId);
        let state = pageStates.get(key);
        if (!state) {
            state = {
                key,
                channel: null,
                callbacks: new Set(),
                heartbeatTimer: null,
                joinPromise: null,
                joinedAt: new Date().toISOString(),
                user: null
            };
            pageStates.set(key, state);
        }
        return state;
    }

    function normalizeEditorsFromPresenceState(state) {
        if (!state?.channel || typeof state.channel.presenceState !== 'function') {
            return [];
        }

        const nowMs = Date.now();
        const raw = state.channel.presenceState() || {};
        const deduped = new Map();

        Object.values(raw).forEach((entries) => {
            (entries || []).forEach((entry) => {
                const userId = entry.user_id || null;
                const userEmail = entry.user_email || 'Authenticated user';
                const role = entry.role || 'chair';
                const since = entry.joined_at || entry.last_seen || new Date().toISOString();
                const lastSeen = entry.last_seen || since;
                const lastSeenMs = Date.parse(lastSeen);

                if (Number.isFinite(lastSeenMs) && nowMs - lastSeenMs > STALE_TTL_MS) {
                    return;
                }

                const dedupeKey = `${userId || userEmail}:${entry.session_id || ''}`;
                const existing = deduped.get(dedupeKey);
                if (!existing || Date.parse(since) < Date.parse(existing.since)) {
                    deduped.set(dedupeKey, {
                        userId,
                        user: userEmail,
                        role,
                        since,
                        sessionId: entry.session_id || null
                    });
                }
            });
        });

        return Array.from(deduped.values()).sort((a, b) => Date.parse(a.since) - Date.parse(b.since));
    }

    function emitPresenceChange(state) {
        const editors = normalizeEditorsFromPresenceState(state);
        state.callbacks.forEach((callback) => {
            try {
                callback(editors);
            } catch (error) {
                console.error('Presence callback failed:', error);
            }
        });
    }

    async function trackHeartbeat(state) {
        if (!state?.channel || !state.user?.id || typeof state.channel.track !== 'function') {
            return;
        }

        await state.channel.track({
            session_id: sessionId,
            user_id: state.user.id,
            user_email: state.user.email || 'Authenticated user',
            role: state.user.role || 'chair',
            joined_at: state.joinedAt,
            last_seen: new Date().toISOString()
        });
    }

    async function joinPage(pageId) {
        const client = getClient();
        if (!client || typeof client.channel !== 'function') {
            return false;
        }

        const state = ensurePageState(pageId);
        if (state.joinPromise) {
            return state.joinPromise;
        }

        state.joinPromise = (async () => {
            state.user = await resolveCurrentUser();
            if (!state.user?.id) {
                return false;
            }

            if (!state.channel) {
                state.channel = client.channel(`${CHANNEL_PREFIX}${state.key}`, {
                    config: {
                        presence: {
                            key: `${state.user.id}:${sessionId}`
                        }
                    }
                });

                state.channel
                    .on('presence', { event: 'sync' }, () => emitPresenceChange(state))
                    .on('presence', { event: 'join' }, () => emitPresenceChange(state))
                    .on('presence', { event: 'leave' }, () => emitPresenceChange(state));
            }

            await new Promise((resolve, reject) => {
                let settled = false;
                const timeout = setTimeout(() => {
                    if (!settled) {
                        settled = true;
                        reject(new Error(`Presence join timed out for ${state.key}`));
                    }
                }, 5000);

                state.channel.subscribe(async (status) => {
                    if (status === 'SUBSCRIBED' && !settled) {
                        settled = true;
                        clearTimeout(timeout);
                        resolve(true);
                    }
                    if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !settled) {
                        settled = true;
                        clearTimeout(timeout);
                        reject(new Error(`Presence subscribe failed for ${state.key}: ${status}`));
                    }
                });
            });

            await trackHeartbeat(state);
            if (state.heartbeatTimer) {
                clearInterval(state.heartbeatTimer);
            }
            state.heartbeatTimer = setInterval(() => {
                trackHeartbeat(state).catch(() => {});
            }, HEARTBEAT_MS);

            emitPresenceChange(state);

            if (!unloadHandlerBound && typeof window !== 'undefined') {
                unloadHandlerBound = true;
                window.addEventListener('beforeunload', () => {
                    Array.from(pageStates.keys()).forEach((key) => {
                        leavePage(key);
                    });
                });
            }

            return true;
        })()
            .finally(() => {
                state.joinPromise = null;
            });

        return state.joinPromise;
    }

    function leavePage(pageId) {
        const key = sanitizePageId(pageId);
        const state = pageStates.get(key);
        if (!state) return;

        if (state.heartbeatTimer) {
            clearInterval(state.heartbeatTimer);
            state.heartbeatTimer = null;
        }

        if (state.channel) {
            try {
                if (typeof state.channel.untrack === 'function') {
                    state.channel.untrack();
                }
            } catch (error) {
                // ignore untrack failures during unload/disconnect
            }

            try {
                if (typeof state.channel.unsubscribe === 'function') {
                    state.channel.unsubscribe();
                }
            } catch (error) {
                // ignore unsubscribe failures during unload/disconnect
            }

            const client = getClient();
            if (client && typeof client.removeChannel === 'function') {
                try {
                    client.removeChannel(state.channel);
                } catch (error) {
                    // ignore remove-channel failures during unload/disconnect
                }
            }
        }

        state.callbacks.clear();
        pageStates.delete(key);
    }

    function getActiveEditors(pageId) {
        const state = pageStates.get(sanitizePageId(pageId));
        if (!state) return [];
        return normalizeEditorsFromPresenceState(state);
    }

    function onPresenceChange(pageId, callback) {
        if (typeof callback !== 'function') {
            throw new Error('Presence callback must be a function.');
        }

        const state = ensurePageState(pageId);
        state.callbacks.add(callback);
        callback(getActiveEditors(pageId));

        joinPage(pageId).catch((error) => {
            console.warn('Presence join failed:', error?.message || error);
        });

        return () => {
            state.callbacks.delete(callback);
        };
    }

    function resetForTests() {
        Array.from(pageStates.keys()).forEach((key) => leavePage(key));
    }

    return {
        joinPage,
        leavePage,
        getActiveEditors,
        onPresenceChange,
        _resetForTests: resetForTests
    };
})();

if (typeof window !== 'undefined') {
    window.PresenceService = PresenceService;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PresenceService;
}
