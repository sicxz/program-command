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
        signOut,
        getSession,
        getUser,
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
