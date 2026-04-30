/**
 * Supabase Configuration
 *
 * Host defaults:
 * - public-schedule.html: production database
 * - other localhost / 127.0.0.1 pages: develop database
 * - deployed hosts: production database
 *
 * Local overrides:
 * - ?supabaseEnv=production or ?supabaseEnv=develop
 * - localStorage.setItem('programCommand.supabase.environment', 'develop')
 * - localStorage.setItem('programCommand.supabase.develop.anonKey', '<anon key>')
 */

const SUPABASE_ENVIRONMENTS = Object.freeze({
    production: Object.freeze({
        name: 'production',
        label: 'Production',
        projectRef: 'ohnrhjxcjkrdtudpzjgn',
        url: 'https://ohnrhjxcjkrdtudpzjgn.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9obnJoanhjamtyZHR1ZHB6amduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NDQ2NzAsImV4cCI6MjA4MDUyMDY3MH0.XN1CC0xC5dizIhF4cIEkv90TApJHXRBYTC7a6AXPvtU'
    }),
    develop: Object.freeze({
        name: 'develop',
        label: 'Develop',
        projectRef: 'cstcwplvioheazoghkgf',
        url: 'https://cstcwplvioheazoghkgf.supabase.co',
        anonKey: ''
    })
});

const SUPABASE_STORAGE_KEYS = Object.freeze({
    environment: 'programCommand.supabase.environment',
    url: (environmentName) => `programCommand.supabase.${environmentName}.url`,
    anonKey: (environmentName) => `programCommand.supabase.${environmentName}.anonKey`
});

function getSupabaseRoot() {
    if (typeof window !== 'undefined') {
        return window;
    }

    if (typeof globalThis !== 'undefined') {
        return globalThis;
    }

    return {};
}

function getSupabaseLocation() {
    const root = getSupabaseRoot();

    if (root.location) {
        return root.location;
    }

    if (typeof location !== 'undefined') {
        return location;
    }

    return null;
}

function readSupabaseSearchParam(name) {
    const currentLocation = getSupabaseLocation();

    if (!currentLocation || !currentLocation.search || typeof URLSearchParams === 'undefined') {
        return '';
    }

    try {
        return new URLSearchParams(currentLocation.search).get(name) || '';
    } catch (error) {
        return '';
    }
}

function readSupabaseStorageValue(key) {
    const root = getSupabaseRoot();
    const stores = [root.sessionStorage, root.localStorage];

    for (const store of stores) {
        if (!store || typeof store.getItem !== 'function') {
            continue;
        }

        try {
            const value = store.getItem(key);
            if (value) {
                return value;
            }
        } catch (error) {
            // Storage may be blocked in private contexts.
        }
    }

    return '';
}

function writeSupabaseStorageValue(key, value) {
    const root = getSupabaseRoot();

    if (!root.localStorage || typeof root.localStorage.setItem !== 'function') {
        return false;
    }

    try {
        root.localStorage.setItem(key, value);
        return true;
    } catch (error) {
        return false;
    }
}

function removeSupabaseStorageValue(key) {
    const root = getSupabaseRoot();

    if (!root.localStorage || typeof root.localStorage.removeItem !== 'function') {
        return false;
    }

    try {
        root.localStorage.removeItem(key);
        return true;
    } catch (error) {
        return false;
    }
}

function normalizeSupabaseEnvironmentName(value) {
    const normalized = String(value || '').trim().toLowerCase();

    if (normalized === 'dev' || normalized === 'development') {
        return 'develop';
    }

    if (normalized === 'prod') {
        return 'production';
    }

    if (SUPABASE_ENVIRONMENTS[normalized]) {
        return normalized;
    }

    return '';
}

function isLocalSupabaseHost(hostname) {
    const normalized = String(hostname || '').trim().toLowerCase();

    return normalized === 'localhost' ||
        normalized === '127.0.0.1' ||
        normalized === '::1' ||
        normalized.endsWith('.local');
}

function isPublicSchedulePage() {
    const currentLocation = getSupabaseLocation();
    const pathname = currentLocation && currentLocation.pathname ? currentLocation.pathname : '';

    return /(^|\/)public-schedule\.html$/i.test(pathname);
}

function getDefaultSupabaseEnvironmentName() {
    const currentLocation = getSupabaseLocation();
    const hostname = currentLocation && currentLocation.hostname ? currentLocation.hostname : '';

    if (isPublicSchedulePage()) {
        return 'production';
    }

    return isLocalSupabaseHost(hostname) ? 'develop' : 'production';
}

function getRequestedSupabaseEnvironmentName() {
    return normalizeSupabaseEnvironmentName(
        readSupabaseSearchParam('supabaseEnv') ||
        readSupabaseSearchParam('supabaseEnvironment') ||
        readSupabaseStorageValue(SUPABASE_STORAGE_KEYS.environment)
    );
}

function readWindowSupabaseOverride(environmentName, key) {
    const root = getSupabaseRoot();
    const config = root.PROGRAM_COMMAND_SUPABASE_CONFIG || {};
    const environmentConfig = config[environmentName] || {};

    return environmentConfig[key] || '';
}

function readSupabaseOverride(environmentName, key) {
    const queryParam = key === 'url' ? 'supabaseUrl' : 'supabaseAnonKey';

    return readSupabaseSearchParam(queryParam) ||
        readSupabaseStorageValue(SUPABASE_STORAGE_KEYS[key](environmentName)) ||
        readWindowSupabaseOverride(environmentName, key);
}

function resolveSupabaseEnvironmentConfig() {
    const environmentName = getRequestedSupabaseEnvironmentName() || getDefaultSupabaseEnvironmentName();
    const baseConfig = SUPABASE_ENVIRONMENTS[environmentName] || SUPABASE_ENVIRONMENTS.production;

    return {
        name: baseConfig.name,
        label: baseConfig.label,
        projectRef: baseConfig.projectRef,
        url: readSupabaseOverride(baseConfig.name, 'url') || baseConfig.url,
        anonKey: readSupabaseOverride(baseConfig.name, 'anonKey') || baseConfig.anonKey
    };
}

function isUsableSupabaseValue(value) {
    const normalized = String(value || '').trim();

    return Boolean(normalized) &&
        normalized !== 'YOUR_SUPABASE_PROJECT_URL' &&
        normalized !== 'YOUR_SUPABASE_ANON_KEY';
}

const SUPABASE_CONFIG = Object.freeze(resolveSupabaseEnvironmentConfig());
const SUPABASE_URL = SUPABASE_CONFIG.url;
const SUPABASE_ANON_KEY = SUPABASE_CONFIG.anonKey;

// Current department code (for multi-department support)
const CURRENT_DEPARTMENT_CODE = 'DESN';

// Capture the Supabase SDK namespace before we assign the legacy `supabase` client alias
// in classic-script pages (which would otherwise overwrite `window.supabase`).
const supabaseSdkNamespace =
    (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function')
        ? window.supabase
        : null;

// Initialize Supabase client (only if credentials are configured)
let supabaseClient = null;
var supabase = null; // Global reference for other services (var to avoid redeclaration issues)

function isSupabaseConfigured() {
    return isUsableSupabaseValue(SUPABASE_URL) &&
           isUsableSupabaseValue(SUPABASE_ANON_KEY);
}

function getSupabaseEnvironment() {
    return SUPABASE_CONFIG.name;
}

function getSupabaseEnvironmentConfig() {
    return {
        name: SUPABASE_CONFIG.name,
        label: SUPABASE_CONFIG.label,
        projectRef: SUPABASE_CONFIG.projectRef,
        url: SUPABASE_CONFIG.url,
        anonKeyConfigured: isUsableSupabaseValue(SUPABASE_CONFIG.anonKey)
    };
}

function initSupabase() {
    if (supabaseClient) {
        return supabaseClient;
    }

    if (!isSupabaseConfigured()) {
        console.warn(`Supabase ${SUPABASE_CONFIG.name} is not configured. Check the anon key for ${SUPABASE_CONFIG.projectRef}.`);
        return null;
    }

    const supabaseSdk =
        (supabaseSdkNamespace && typeof supabaseSdkNamespace.createClient === 'function')
            ? supabaseSdkNamespace
            : (window.supabase && typeof window.supabase.createClient === 'function' ? window.supabase : null);

    if (!supabaseSdk) {
        console.error('Supabase JS library not loaded. Add the script tag before this file.');
        return null;
    }

    supabaseClient = supabaseSdk.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            flowType: 'pkce',
            detectSessionInUrl: true,
            persistSession: true,
            autoRefreshToken: true
        }
    });
    supabase = supabaseClient; // Set global reference
    // Expose client for module and non-module scripts.
    window.supabaseClient = supabaseClient;
    window.getSupabaseClient = getSupabaseClient;
    console.log(`Supabase client initialized successfully (${SUPABASE_CONFIG.name}: ${SUPABASE_CONFIG.projectRef})`);
    return supabaseClient;
}

function getSupabaseClient() {
    if (!supabaseClient) {
        return initSupabase();
    }
    return supabaseClient;
}

// Auto-initialize when script loads
document.addEventListener('DOMContentLoaded', () => {
    initSupabase();
});

if (typeof window !== 'undefined') {
    window.SUPABASE_ENVIRONMENTS = SUPABASE_ENVIRONMENTS;
    window.SUPABASE_CONFIG = getSupabaseEnvironmentConfig();
    window.getSupabaseEnvironment = getSupabaseEnvironment;
    window.getSupabaseEnvironmentConfig = getSupabaseEnvironmentConfig;
    window.isSupabaseConfigured = isSupabaseConfigured;
    window.getSupabaseClient = getSupabaseClient;
    window.initSupabase = initSupabase;
    window.ProgramCommandSupabase = {
        getEnvironment: getSupabaseEnvironment,
        getConfig: getSupabaseEnvironmentConfig,
        setEnvironment(environmentName) {
            const normalized = normalizeSupabaseEnvironmentName(environmentName);
            if (!normalized) {
                throw new Error(`Unknown Supabase environment: ${environmentName}`);
            }
            return writeSupabaseStorageValue(SUPABASE_STORAGE_KEYS.environment, normalized);
        },
        setDevelopAnonKey(anonKey) {
            return writeSupabaseStorageValue(SUPABASE_STORAGE_KEYS.anonKey('develop'), anonKey);
        },
        clearLocalOverrides() {
            removeSupabaseStorageValue(SUPABASE_STORAGE_KEYS.environment);
            Object.keys(SUPABASE_ENVIRONMENTS).forEach((environmentName) => {
                removeSupabaseStorageValue(SUPABASE_STORAGE_KEYS.url(environmentName));
                removeSupabaseStorageValue(SUPABASE_STORAGE_KEYS.anonKey(environmentName));
            });
        }
    };
}
