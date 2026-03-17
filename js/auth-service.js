/**
 * Auth Service Layer
 * Wraps Supabase Auth operations behind a stable singleton API.
 */
const AuthService = (function() {
    'use strict';

    let cachedClient = null;
    let cachedNormalizedUser = null;

    const ROLE_ADMIN = 'admin';
    const ROLE_CHAIR = 'chair';
    const OAUTH_INTENT_STORAGE_KEY = 'pc_oauth_intent_v1';
    const OAUTH_INTENT_MAX_AGE_MS = 10 * 60 * 1000;

    const OAUTH_SCOPE_MAP = {
        google: 'openid email profile',
        github: 'read:user user:email',
        apple: 'name email'
    };

    const SUPPORTED_OAUTH_PROVIDERS = new Set(Object.keys(OAUTH_SCOPE_MAP));

    const ACTION_ALIASES = {
        read: 'read',
        view: 'read',
        list: 'read',
        get: 'read',
        write: 'write',
        create: 'write',
        insert: 'write',
        update: 'write',
        edit: 'write',
        delete: 'write',
        save: 'write',
        manage: 'manage',
        admin: 'manage',
        configure: 'manage',
        invite: 'manage'
    };

    const RESOURCE_ALIASES = {
        schedule: 'schedule',
        schedules: 'schedule',
        scheduler: 'schedule',
        workload: 'workload',
        workloads: 'workload',
        department: 'departments',
        departments: 'departments',
        academic_year: 'academic_years',
        academic_years: 'academic_years',
        'academic-year': 'academic_years',
        'academic-years': 'academic_years',
        room: 'rooms',
        rooms: 'rooms',
        course: 'courses',
        courses: 'courses',
        faculty: 'faculty',
        scheduled_course: 'scheduled_courses',
        scheduled_courses: 'scheduled_courses',
        'scheduled-course': 'scheduled_courses',
        'scheduled-courses': 'scheduled_courses',
        faculty_preference: 'faculty_preferences',
        faculty_preferences: 'faculty_preferences',
        'faculty-preference': 'faculty_preferences',
        'faculty-preferences': 'faculty_preferences',
        scheduling_constraint: 'scheduling_constraints',
        scheduling_constraints: 'scheduling_constraints',
        'scheduling-constraint': 'scheduling_constraints',
        'scheduling-constraints': 'scheduling_constraints',
        release_time: 'release_time',
        'release-time': 'release_time',
        pathways: 'pathways',
        pathway_courses: 'pathway_courses',
        'pathway-courses': 'pathway_courses',
        system_config: 'system_config',
        'system-config': 'system_config',
        config: 'system_config',
        configuration: 'system_config',
        accounts: 'accounts',
        users: 'accounts',
        auth: 'accounts'
    };

    const CHAIR_PERMISSIONS = {
        read: new Set([
            'schedule',
            'workload',
            'system_config',
            'departments',
            'academic_years',
            'rooms',
            'courses',
            'faculty',
            'scheduled_courses',
            'faculty_preferences',
            'scheduling_constraints',
            'release_time',
            'pathways',
            'pathway_courses'
        ]),
        write: new Set([
            'schedule',
            'workload',
            'academic_years',
            'rooms',
            'courses',
            'faculty',
            'scheduled_courses',
            'faculty_preferences',
            'scheduling_constraints',
            'release_time',
            'pathways',
            'pathway_courses'
        ]),
        manage: new Set([])
    };

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

    function normalizeRole(rawRole) {
        const role = String(rawRole || '').trim().toLowerCase();
        if (role === ROLE_ADMIN) return ROLE_ADMIN;
        return ROLE_CHAIR;
    }

    function normalizeOAuthProvider(rawProvider) {
        const provider = String(rawProvider || '').trim().toLowerCase();
        if (!SUPPORTED_OAUTH_PROVIDERS.has(provider)) {
            return null;
        }
        return provider;
    }

    function requireOAuthProvider(rawProvider) {
        const provider = normalizeOAuthProvider(rawProvider);
        if (!provider) {
            throw new Error('Unsupported OAuth provider. Expected one of: google, github, apple.');
        }
        return provider;
    }

    function getOAuthScopes(provider) {
        return OAUTH_SCOPE_MAP[provider] || '';
    }

    function randomNonce() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return `nonce-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function safeSessionStorage() {
        if (typeof window === 'undefined' || !window.sessionStorage) {
            return null;
        }
        return window.sessionStorage;
    }

    function writeOAuthIntent(intent) {
        const store = safeSessionStorage();
        if (!store) return;
        try {
            store.setItem(OAUTH_INTENT_STORAGE_KEY, JSON.stringify(intent));
        } catch (error) {
            // ignore storage failures and continue with best-effort OAuth flow
        }
    }

    function readOAuthIntent() {
        const store = safeSessionStorage();
        if (!store) return null;
        try {
            const raw = store.getItem(OAUTH_INTENT_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            const createdAtMs = Date.parse(parsed.createdAt || '');
            if (!Number.isFinite(createdAtMs) || (Date.now() - createdAtMs) > OAUTH_INTENT_MAX_AGE_MS) {
                store.removeItem(OAUTH_INTENT_STORAGE_KEY);
                return null;
            }
            return parsed;
        } catch (error) {
            return null;
        }
    }

    function clearOAuthIntent() {
        const store = safeSessionStorage();
        if (!store) return;
        try {
            store.removeItem(OAUTH_INTENT_STORAGE_KEY);
        } catch (error) {
            // ignore storage failures
        }
    }

    function resolveCurrentPathWithQuery() {
        if (typeof window === 'undefined' || !window.location) {
            return '/index.html';
        }
        return `${window.location.pathname}${window.location.search}`;
    }

    function resolveOAuthRedirectUrl(nextPath = '') {
        if (typeof window === 'undefined' || !window.location) {
            return '/login.html';
        }

        const redirectUrl = new URL('/login.html', window.location.origin);
        if (nextPath) {
            redirectUrl.searchParams.set('next', nextPath);
        }
        return redirectUrl.toString();
    }

    function hasOAuthCallbackParams() {
        if (typeof window === 'undefined' || !window.location) return false;
        const params = new URLSearchParams(window.location.search || '');
        if (params.has('code') || params.has('error') || params.has('error_description')) {
            return true;
        }
        const hash = String(window.location.hash || '');
        return hash.includes('access_token=') || hash.includes('id_token=') || hash.includes('refresh_token=');
    }

    function cleanOAuthCallbackUrl() {
        if (typeof window === 'undefined' || !window.location || !window.history || !window.history.replaceState) {
            return;
        }

        const url = new URL(window.location.href);
        const removableKeys = ['code', 'state', 'error', 'error_description'];
        removableKeys.forEach((key) => url.searchParams.delete(key));
        url.hash = '';
        const title = (typeof document !== 'undefined' && typeof document.title === 'string') ? document.title : '';
        window.history.replaceState({}, title, `${url.pathname}${url.search}`);
    }

    function normalizeProviderIdentity(identity) {
        if (!identity || typeof identity !== 'object') return null;
        const provider = normalizeOAuthProvider(identity.provider);
        if (!provider) return null;

        const identityData = identity.identity_data || {};
        const providerUserId =
            identityData.sub ||
            identityData.id ||
            identity.id ||
            null;

        if (!providerUserId) return null;

        return {
            provider,
            providerUserId: String(providerUserId),
            providerEmail: identityData.email || identityData.preferred_username || null,
            identityData
        };
    }

    function extractProviderIdentities(user) {
        if (!user || !Array.isArray(user.identities)) return [];
        return user.identities
            .map((identity) => normalizeProviderIdentity(identity))
            .filter(Boolean);
    }

    async function upsertUserIdentityMappings(user, identities) {
        if (!user?.id || !Array.isArray(identities) || identities.length === 0) {
            return [];
        }

        const client = getClientOrThrow();
        if (typeof client.from !== 'function') {
            return [];
        }

        const payload = identities.map((identity) => ({
            user_id: user.id,
            provider: identity.provider,
            provider_user_id: identity.providerUserId,
            provider_email: identity.providerEmail,
            identity_data: identity.identityData || {}
        }));

        const { data, error } = await client
            .from('user_identities')
            .upsert(payload, { onConflict: 'provider,provider_user_id' })
            .select('provider, provider_user_id, provider_email, linked_at, updated_at');

        if (error) throw error;
        return data || [];
    }

    async function syncCurrentUserIdentityMappings(options = {}) {
        const user = await getUser();
        if (!user?.id) {
            throw new Error('You must be signed in before linking a provider.');
        }

        const expectedProvider = options.expectedProvider
            ? requireOAuthProvider(options.expectedProvider)
            : null;

        const identities = extractProviderIdentities(user);
        if (!identities.length) {
            if (expectedProvider) {
                throw new Error(`No ${expectedProvider} identity found in the current session.`);
            }
            return [];
        }

        const filtered = expectedProvider
            ? identities.filter((identity) => identity.provider === expectedProvider)
            : identities;

        if (expectedProvider && filtered.length === 0) {
            throw new Error(`No ${expectedProvider} identity found in the current session.`);
        }

        return upsertUserIdentityMappings(user, filtered);
    }

    function normalizeAction(rawAction) {
        const action = String(rawAction || '').trim().toLowerCase();
        return ACTION_ALIASES[action] || null;
    }

    function normalizeResource(rawResource) {
        const canonical = String(rawResource || '')
            .trim()
            .toLowerCase()
            .replace(/[.\s]+/g, '_');
        return RESOURCE_ALIASES[canonical] || canonical || null;
    }

    function resolveRoleFromContext(context) {
        if (typeof context === 'string') {
            return normalizeRole(context);
        }

        if (context && typeof context === 'object') {
            if (typeof context.role === 'string') {
                return normalizeRole(context.role);
            }
            if (context.user && typeof context.user === 'object') {
                const userRole = extractRole(context.user) || context.user.role;
                if (userRole) {
                    return normalizeRole(userRole);
                }
            }
        }

        if (cachedNormalizedUser?.role) {
            return normalizeRole(cachedNormalizedUser.role);
        }

        return ROLE_CHAIR;
    }

    function hasPermission(role, action, resource) {
        if (role === ROLE_ADMIN) return true;
        if (role !== ROLE_CHAIR) return false;

        const permittedResources = CHAIR_PERMISSIONS[action];
        if (!permittedResources) return false;
        return permittedResources.has(resource);
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
        cachedNormalizedUser = user;
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
        cachedNormalizedUser = user;
        return {
            user,
            session: data?.session || null
        };
    }

    async function beginOAuthSignIn(provider, options = {}) {
        if (!isConfigured()) {
            throw new Error('Supabase is not configured.');
        }

        const normalizedProvider = requireOAuthProvider(provider);
        const nextPath = String(options.nextPath || '').trim() || '/index.html';
        const intent = {
            mode: 'signin',
            provider: normalizedProvider,
            nextPath,
            nonce: randomNonce(),
            createdAt: new Date().toISOString()
        };
        writeOAuthIntent(intent);

        const client = getClientOrThrow();
        const { data, error } = await client.auth.signInWithOAuth({
            provider: normalizedProvider,
            options: {
                redirectTo: resolveOAuthRedirectUrl(nextPath),
                scopes: getOAuthScopes(normalizedProvider)
            }
        });

        if (error) {
            clearOAuthIntent();
            throw error;
        }

        return data || null;
    }

    async function beginOAuthLink(provider, options = {}) {
        if (!isConfigured()) {
            throw new Error('Supabase is not configured.');
        }

        const session = await getSession();
        if (!session?.user?.id) {
            throw new Error('Sign in with your existing account before linking a provider.');
        }

        const normalizedProvider = requireOAuthProvider(provider);
        const nextPath = String(options.nextPath || '').trim() || resolveCurrentPathWithQuery();
        const intent = {
            mode: 'link',
            provider: normalizedProvider,
            nextPath,
            nonce: randomNonce(),
            createdAt: new Date().toISOString()
        };
        writeOAuthIntent(intent);

        const client = getClientOrThrow();
        const { data, error } = await client.auth.signInWithOAuth({
            provider: normalizedProvider,
            options: {
                redirectTo: resolveOAuthRedirectUrl(nextPath),
                scopes: getOAuthScopes(normalizedProvider)
            }
        });

        if (error) {
            clearOAuthIntent();
            throw error;
        }

        return data || null;
    }

    async function signOut() {
        if (!isConfigured()) {
            return true;
        }

        const client = getClientOrThrow();
        const { error } = await client.auth.signOut();
        if (error) throw error;
        cachedNormalizedUser = null;
        return true;
    }

    async function getSession() {
        if (!isConfigured()) {
            return null;
        }

        const client = getClientOrThrow();
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        const session = data?.session || null;
        if (session?.user) {
            cachedNormalizedUser = normalizeUser(session.user);
        }
        return session;
    }

    async function getUser() {
        if (!isConfigured()) {
            return null;
        }

        const client = getClientOrThrow();
        const { data, error } = await client.auth.getUser();
        if (error) throw error;
        const user = normalizeUser(data?.user || null);
        cachedNormalizedUser = user;
        return user;
    }

    async function getLinkedIdentities() {
        if (!isConfigured()) {
            return [];
        }

        const user = await getUser();
        if (!user?.id) {
            return [];
        }

        const client = getClientOrThrow();
        if (typeof client.from !== 'function') {
            return [];
        }

        const { data, error } = await client
            .from('user_identities')
            .select('provider, provider_user_id, provider_email, linked_at, updated_at')
            .eq('user_id', user.id)
            .order('provider', { ascending: true });

        if (error) throw error;
        return data || [];
    }

    async function linkCurrentSessionIdentity(provider) {
        const normalizedProvider = requireOAuthProvider(provider);
        return syncCurrentUserIdentityMappings({
            expectedProvider: normalizedProvider
        });
    }

    async function completeOAuthRedirect() {
        if (!isConfigured()) {
            return { handled: false, success: false, error: 'Supabase is not configured.' };
        }

        const intent = readOAuthIntent();
        const hasCallback = hasOAuthCallbackParams();

        if (!intent && !hasCallback) {
            return { handled: false, success: false };
        }

        const params = new URLSearchParams((typeof window !== 'undefined' && window.location && window.location.search) || '');
        const providerError = params.get('error_description') || params.get('error');
        if (providerError) {
            clearOAuthIntent();
            cleanOAuthCallbackUrl();
            return {
                handled: true,
                mode: intent?.mode || 'signin',
                success: false,
                error: providerError
            };
        }

        const client = getClientOrThrow();
        const code = params.get('code');
        if (code && client.auth && typeof client.auth.exchangeCodeForSession === 'function') {
            const { error } = await client.auth.exchangeCodeForSession(code);
            if (error) {
                clearOAuthIntent();
                cleanOAuthCallbackUrl();
                return {
                    handled: true,
                    mode: intent?.mode || 'signin',
                    success: false,
                    error: error.message || 'OAuth sign-in failed.'
                };
            }
        }

        const session = await getSession();
        if (!session?.user) {
            clearOAuthIntent();
            cleanOAuthCallbackUrl();
            return {
                handled: true,
                mode: intent?.mode || 'signin',
                success: false,
                error: 'Authentication session was not established.'
            };
        }

        let linkedIdentities = [];
        try {
            linkedIdentities = await syncCurrentUserIdentityMappings({
                expectedProvider: intent?.provider || null
            });
        } catch (error) {
            clearOAuthIntent();
            cleanOAuthCallbackUrl();
            return {
                handled: true,
                mode: intent?.mode || 'signin',
                success: false,
                error: error?.message || 'Identity linking failed.'
            };
        }

        clearOAuthIntent();
        cleanOAuthCallbackUrl();
        return {
            handled: true,
            mode: intent?.mode || 'signin',
            success: true,
            nextPath: intent?.nextPath || '/index.html',
            linkedIdentities
        };
    }

    function onAuthStateChange(callback) {
        if (typeof callback !== 'function') {
            throw new Error('Auth state callback must be a function.');
        }

        const client = getClientOrThrow();
        const { data, error } = client.auth.onAuthStateChange((event, session) => {
            const normalizedUser = normalizeUser(session?.user || null);
            cachedNormalizedUser = normalizedUser;
            const normalizedSession = session
                ? { ...session, user: normalizedUser }
                : null;
            callback(event, normalizedSession, normalizedUser);
        });

        if (error) throw error;
        return data?.subscription || data || null;
    }

    function can(action, resource, context = null) {
        const normalizedAction = normalizeAction(action);
        const normalizedResource = normalizeResource(resource);

        if (!normalizedAction || !normalizedResource) {
            return false;
        }

        const role = resolveRoleFromContext(context);
        return hasPermission(role, normalizedAction, normalizedResource);
    }

    function resetForTests() {
        cachedClient = null;
        cachedNormalizedUser = null;
    }

    return {
        init,
        signUp,
        signIn,
        beginOAuthSignIn,
        beginOAuthLink,
        completeOAuthRedirect,
        signOut,
        getSession,
        getUser,
        getLinkedIdentities,
        linkCurrentSessionIdentity,
        can,
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
