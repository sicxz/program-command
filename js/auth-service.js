/**
 * Auth Service Layer
 * Wraps Supabase Auth operations behind a stable singleton API.
 */
const AuthService = (function() {
    'use strict';

    let cachedClient = null;

    function isConfigured() {
        if (typeof isSupabaseConfigured === 'function') {
            return isSupabaseConfigured();
        }
        if (typeof window !== 'undefined' && typeof window.isSupabaseConfigured === 'function') {
            return window.isSupabaseConfigured();
        }
        return true;
    }

    function resolveClient() {
        if (cachedClient) {
            return cachedClient;
        }

        if (typeof getSupabaseClient === 'function') {
            cachedClient = getSupabaseClient();
        } else if (typeof window !== 'undefined' && typeof window.getSupabaseClient === 'function') {
            cachedClient = window.getSupabaseClient();
        }

        return cachedClient;
    }

    function getClientOrThrow() {
        const client = resolveClient();
        if (!client || !client.auth) {
            throw new Error('Supabase Auth client is not available.');
        }
        return client;
    }

    function extractRole(user) {
        if (!user) return null;
        return (
            user.app_metadata?.role ||
            user.user_metadata?.role ||
            user.raw_user_meta_data?.role ||
            null
        );
    }

    function normalizeUser(user, fallbackRole = null) {
        if (!user) return null;
        return {
            ...user,
            role: extractRole(user) || fallbackRole || null
        };
    }

    function init() {
        if (!isConfigured()) {
            return null;
        }
        return resolveClient();
    }

    async function signUp(email, password, role = 'chair') {
        if (!isConfigured()) {
            throw new Error('Supabase is not configured.');
        }

        const client = getClientOrThrow();
        const { data, error } = await client.auth.signUp({
            email,
            password,
            options: {
                data: { role }
            }
        });

        if (error) throw error;

        const user = normalizeUser(data?.user || null, role);
        return {
            user,
            session: data?.session || null,
            role: user?.role || role
        };
    }

    async function signIn(email, password) {
        if (!isConfigured()) {
            throw new Error('Supabase is not configured.');
        }

        const client = getClientOrThrow();
        const { data, error } = await client.auth.signInWithPassword({ email, password });

        if (error) throw error;

        const user = normalizeUser(data?.user || data?.session?.user || null);
        return {
            user,
            session: data?.session || null
        };
    }

    async function signOut() {
        if (!isConfigured()) {
            return true;
        }

        const client = getClientOrThrow();
        const { error } = await client.auth.signOut();
        if (error) throw error;
        return true;
    }

    async function getSession() {
        if (!isConfigured()) {
            return null;
        }

        const client = getClientOrThrow();
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        return data?.session || null;
    }

    async function getUser() {
        if (!isConfigured()) {
            return null;
        }

        const client = getClientOrThrow();
        const { data, error } = await client.auth.getUser();
        if (error) throw error;
        return normalizeUser(data?.user || null);
    }

    function onAuthStateChange(callback) {
        if (typeof callback !== 'function') {
            throw new Error('Auth state callback must be a function.');
        }

        const client = getClientOrThrow();
        const { data, error } = client.auth.onAuthStateChange((event, session) => {
            const normalizedUser = normalizeUser(session?.user || null);
            const normalizedSession = session
                ? { ...session, user: normalizedUser }
                : null;
            callback(event, normalizedSession, normalizedUser);
        });

        if (error) throw error;
        return data?.subscription || data || null;
    }

    function resetForTests() {
        cachedClient = null;
    }

    return {
        init,
        signUp,
        signIn,
        signOut,
        getSession,
        getUser,
        onAuthStateChange,
        _resetForTests: resetForTests
    };
})();

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        AuthService.init();
    });
}

if (typeof window !== 'undefined') {
    window.AuthService = AuthService;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthService;
}
