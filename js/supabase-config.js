/**
 * Supabase Configuration
 *
 * Default behavior:
 * - `localhost` / `127.0.0.1` uses the develop database
 * - all other hosts use production
 *
 * Optional override:
 * - `?supabaseEnv=develop` or `?supabaseEnv=production`
 * - `localStorage["program-command.supabase-env"]`
 */

const SUPABASE_ENV_STORAGE_KEY = 'program-command.supabase-env';
const SUPABASE_QUERY_PARAM = 'supabaseEnv';
const PROGRAM_SHELL_SELECTION_STORAGE_KEY = 'programCommandShellSelectionV1';
const PROGRAM_ONBOARDING_CONTEXT_STORAGE_KEY = 'programCommandOnboardingContextV1';

const SUPABASE_ENVIRONMENTS = {
    production: {
        name: 'production',
        url: 'https://ohnrhjxcjkrdtudpzjgn.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9obnJoanhjamtyZHR1ZHB6amduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NDQ2NzAsImV4cCI6MjA4MDUyMDY3MH0.XN1CC0xC5dizIhF4cIEkv90TApJHXRBYTC7a6AXPvtU'
    },
    develop: {
        name: 'develop',
        url: 'https://cstcwplvioheazoghkgf.supabase.co',
        anonKey: 'sb_publishable_2hOaq8gbaOGIwg1_1yRhDw_wS9xhy4z'
    }
};

const CURRENT_DEPARTMENT_CODE = 'DESN';
const CURRENT_DEPARTMENT_NAME = 'Design';

let supabaseClient = null;
let supabaseLibraryRef = (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function')
    ? window.supabase
    : null;
var supabase = null;

function getLocationHostname() {
    if (typeof window !== 'undefined' && window.location && typeof window.location.hostname === 'string') {
        return window.location.hostname;
    }
    if (typeof location !== 'undefined' && typeof location.hostname === 'string') {
        return location.hostname;
    }
    return '';
}

function getSearchParams() {
    const search = (typeof window !== 'undefined' && window.location && typeof window.location.search === 'string')
        ? window.location.search
        : (typeof location !== 'undefined' && typeof location.search === 'string' ? location.search : '');

    return new URLSearchParams(search || '');
}

function getSafeLocalStorage() {
    if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage;
    }
    return null;
}

function readJsonStorageKey(storageKey) {
    const storage = getSafeLocalStorage();
    if (!storage) return null;

    try {
        const raw = storage.getItem(storageKey);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        return null;
    }
}

function readSupabaseEnvironmentOverride() {
    const queryOverride = getSearchParams().get(SUPABASE_QUERY_PARAM);
    if (queryOverride && SUPABASE_ENVIRONMENTS[queryOverride]) {
        return queryOverride;
    }

    if (typeof globalThis !== 'undefined' && SUPABASE_ENVIRONMENTS[globalThis.__PROGRAM_COMMAND_SUPABASE_ENV__]) {
        return globalThis.__PROGRAM_COMMAND_SUPABASE_ENV__;
    }

    if (getSafeLocalStorage()) {
        try {
            const storedValue = getSafeLocalStorage().getItem(SUPABASE_ENV_STORAGE_KEY);
            if (storedValue && SUPABASE_ENVIRONMENTS[storedValue]) {
                return storedValue;
            }
        } catch (error) {
            console.warn('Could not read Supabase environment override from localStorage:', error);
        }
    }

    return null;
}

function inferDefaultSupabaseEnvironment() {
    const hostname = getLocationHostname().toLowerCase();
    if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
        return 'develop';
    }

    return 'production';
}

function getSupabaseEnvironmentName() {
    return readSupabaseEnvironmentOverride() || inferDefaultSupabaseEnvironment();
}

function getSupabaseEnvironment() {
    return SUPABASE_ENVIRONMENTS[getSupabaseEnvironmentName()] || SUPABASE_ENVIRONMENTS.production;
}

function getSupabaseUrl() {
    return getSupabaseEnvironment().url;
}

function getSupabaseAnonKey() {
    return getSupabaseEnvironment().anonKey;
}

function isSupabaseConfigured() {
    const environment = getSupabaseEnvironment();
    return Boolean(environment.url && environment.anonKey);
}

function resetSupabaseClient() {
    supabaseClient = null;
    supabase = null;
    if (typeof window !== 'undefined' && supabaseLibraryRef) {
        window.supabase = supabaseLibraryRef;
    }
}

function setSupabaseEnvironment(environmentName, { persist = true } = {}) {
    if (!SUPABASE_ENVIRONMENTS[environmentName]) {
        throw new Error(`Unknown Supabase environment: ${environmentName}`);
    }

    if (typeof globalThis !== 'undefined') {
        globalThis.__PROGRAM_COMMAND_SUPABASE_ENV__ = environmentName;
    }

    if (persist && getSafeLocalStorage()) {
        getSafeLocalStorage().setItem(SUPABASE_ENV_STORAGE_KEY, environmentName);
    }

    resetSupabaseClient();
    return getSupabaseEnvironment();
}

function clearSupabaseEnvironmentOverride() {
    if (typeof globalThis !== 'undefined') {
        delete globalThis.__PROGRAM_COMMAND_SUPABASE_ENV__;
    }

    if (getSafeLocalStorage()) {
        getSafeLocalStorage().removeItem(SUPABASE_ENV_STORAGE_KEY);
    }

    resetSupabaseClient();
}

function initSupabase() {
    if (!isSupabaseConfigured()) {
        console.warn('Supabase not configured. Using local JSON files as fallback.');
        return null;
    }

    const supabaseLibrary = (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function')
        ? window.supabase
        : supabaseLibraryRef;

    if (!supabaseLibrary) {
        console.error('Supabase JS library not loaded. Add the script tag before this file.');
        return null;
    }

    const environment = getSupabaseEnvironment();
    supabaseLibraryRef = supabaseLibrary;
    supabaseClient = supabaseLibrary.createClient(environment.url, environment.anonKey);
    supabase = supabaseClient;

    if (typeof window !== 'undefined') {
        window.supabase = supabaseClient;
    }

    console.log(`Supabase client initialized successfully (${environment.name})`);
    return supabaseClient;
}

function getSupabaseClient() {
    if (!supabaseClient) {
        return initSupabase();
    }
    return supabaseClient;
}

function getActiveDepartmentProfile() {
    if (typeof globalThis !== 'undefined' && globalThis.__PROGRAM_COMMAND_ACTIVE_PROFILE__) {
        return globalThis.__PROGRAM_COMMAND_ACTIVE_PROFILE__;
    }
    if (typeof window !== 'undefined' && window.activeDepartmentProfile) {
        return window.activeDepartmentProfile;
    }
    return null;
}

function slugifyProgramValue(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^ewu\s+/, 'ewu-')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

function buildProgramCodeCandidates({
    selection = null,
    suggestedIdentity = null,
    profile = null
} = {}) {
    const candidates = [];
    const addCandidate = (value) => {
        const normalized = slugifyProgramValue(value);
        if (!normalized || candidates.includes(normalized)) return;
        candidates.push(normalized);
    };

    addCandidate(selection?.id);
    addCandidate(selection?.departmentId);
    addCandidate(selection?.label);
    addCandidate(selection?.identityName);
    addCandidate(selection?.departmentLabel);
    addCandidate(selection?.suggestedCode);
    addCandidate(suggestedIdentity?.displayName);
    addCandidate(suggestedIdentity?.name);
    addCandidate(suggestedIdentity?.code);
    addCandidate(profile?.identity?.displayName);
    addCandidate(profile?.identity?.name);
    addCandidate(profile?.identity?.code);

    const identityCode = String(suggestedIdentity?.code || profile?.identity?.code || '').trim().toUpperCase();
    const identityName = String(suggestedIdentity?.name || profile?.identity?.name || '').trim().toLowerCase();
    if (identityCode === 'DESN' || identityName === 'design') {
        addCandidate('ewu-design');
    }

    if (!candidates.length) {
        addCandidate('ewu-design');
    }

    return candidates;
}

function readProgramShellSelection() {
    if (typeof window !== 'undefined'
        && window.ProgramCommandShell
        && typeof window.ProgramCommandShell.readSelection === 'function') {
        try {
            return window.ProgramCommandShell.readSelection();
        } catch (error) {
            return null;
        }
    }

    return readJsonStorageKey(PROGRAM_SHELL_SELECTION_STORAGE_KEY);
}

function readProgramOnboardingContext() {
    if (typeof window !== 'undefined'
        && window.ProgramCommandShell
        && typeof window.ProgramCommandShell.readOnboardingContext === 'function') {
        try {
            return window.ProgramCommandShell.readOnboardingContext();
        } catch (error) {
            return null;
        }
    }

    return readJsonStorageKey(PROGRAM_ONBOARDING_CONTEXT_STORAGE_KEY);
}

function createRuntimeContextFromSource(sourceName, {
    selection = null,
    suggestedIdentity = null,
    profile = null
} = {}) {
    const identity = suggestedIdentity || profile?.identity || {};
    const code = String(identity.code || selection?.suggestedCode || CURRENT_DEPARTMENT_CODE).trim().toUpperCase() || CURRENT_DEPARTMENT_CODE;
    const name = String(identity.name || identity.shortName || selection?.identityName || selection?.label || selection?.departmentLabel || CURRENT_DEPARTMENT_NAME).trim() || CURRENT_DEPARTMENT_NAME;
    const displayName = String(identity.displayName || selection?.identityDisplayName || `EWU ${name}`).trim() || `EWU ${name}`;

    return {
        source: sourceName,
        selectionId: String(selection?.id || '').trim() || null,
        departmentId: String(selection?.departmentId || '').trim() || null,
        identity: { code, name, displayName },
        programCodeCandidates: buildProgramCodeCandidates({ selection, suggestedIdentity, profile })
    };
}

function getProgramCommandRuntimeContext() {
    const activeProfile = getActiveDepartmentProfile();
    if (activeProfile && activeProfile.identity) {
        return createRuntimeContextFromSource('active-profile', {
            profile: activeProfile
        });
    }

    const shellSelection = readProgramShellSelection();
    if (shellSelection) {
        return createRuntimeContextFromSource('shell-selection', {
            selection: shellSelection,
            suggestedIdentity: shellSelection.suggestedIdentity || {
                code: shellSelection.suggestedCode,
                name: shellSelection.identityName || shellSelection.label || shellSelection.departmentLabel,
                displayName: shellSelection.identityDisplayName
            }
        });
    }

    const onboardingContext = readProgramOnboardingContext();
    if (onboardingContext) {
        return createRuntimeContextFromSource('onboarding-context', {
            selection: onboardingContext,
            suggestedIdentity: onboardingContext.suggestedIdentity || {
                code: onboardingContext.suggestedCode,
                name: onboardingContext.identityName || onboardingContext.label || onboardingContext.departmentLabel,
                displayName: onboardingContext.identityDisplayName
            }
        });
    }

    return createRuntimeContextFromSource('design-bootstrap-default', {
        suggestedIdentity: {
            code: CURRENT_DEPARTMENT_CODE,
            name: CURRENT_DEPARTMENT_NAME,
            displayName: `EWU ${CURRENT_DEPARTMENT_NAME}`
        }
    });
}

function getActiveDepartmentIdentity() {
    return getProgramCommandRuntimeContext().identity;
}

function getSupabaseConfigSnapshot() {
    const environment = getSupabaseEnvironment();
    const runtimeContext = getProgramCommandRuntimeContext();
    return {
        environment: environment.name,
        url: environment.url,
        departmentCode: runtimeContext.identity.code,
        departmentSource: runtimeContext.source,
        programCodeCandidates: runtimeContext.programCodeCandidates.slice()
    };
}

if (typeof window !== 'undefined') {
    window.getSupabaseEnvironmentName = getSupabaseEnvironmentName;
    window.getSupabaseEnvironment = getSupabaseEnvironment;
    window.getSupabaseUrl = getSupabaseUrl;
    window.getSupabaseAnonKey = getSupabaseAnonKey;
    window.isSupabaseConfigured = isSupabaseConfigured;
    window.getSupabaseClient = getSupabaseClient;
    window.setSupabaseEnvironment = setSupabaseEnvironment;
    window.clearSupabaseEnvironmentOverride = clearSupabaseEnvironmentOverride;
    window.getSupabaseConfigSnapshot = getSupabaseConfigSnapshot;
    window.getActiveDepartmentIdentity = getActiveDepartmentIdentity;
    window.getProgramCommandRuntimeContext = getProgramCommandRuntimeContext;
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', () => {
        initSupabase();
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SUPABASE_ENV_STORAGE_KEY,
        SUPABASE_QUERY_PARAM,
        SUPABASE_ENVIRONMENTS,
        CURRENT_DEPARTMENT_CODE,
        CURRENT_DEPARTMENT_NAME,
        inferDefaultSupabaseEnvironment,
        getSupabaseEnvironmentName,
        getSupabaseEnvironment,
        getSupabaseUrl,
        getSupabaseAnonKey,
        isSupabaseConfigured,
        setSupabaseEnvironment,
        clearSupabaseEnvironmentOverride,
        getSupabaseConfigSnapshot,
        getActiveDepartmentIdentity,
        getProgramCommandRuntimeContext
    };
}
