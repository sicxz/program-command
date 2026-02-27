/*
 * Department profile runtime loader/validator (v1)
 * Provides a lightweight config foundation for multi-department onboarding.
 */
(function departmentProfileRuntime(global) {
    'use strict';

    const ACTIVE_PROFILE_STORAGE_KEY = 'programCommandActiveDepartmentProfileId';
    const PROFILE_MANIFEST_FILE = 'manifest.json';
    const DEFAULT_PROFILE_ID = 'design-v1';
    const CURRENT_SCHEMA_VERSION = 1;

    const DEFAULT_PROFILE = Object.freeze({
        version: 1,
        id: 'design-v1',
        identity: {
            name: 'Design',
            code: 'DESN',
            displayName: 'EWU Design',
            shortName: 'Design'
        },
        branding: {
            appTitle: 'Program Command - EWU Design',
            headerEyebrow: 'EWU DESIGN · PROGRAM COMMAND',
            headerSubtitle: 'Design Program Planning, Scheduling, and Scenario Control',
            themeTokens: {
                headerTop: '#3d444d',
                headerBottom: '#24292f',
                headerForeground: '#ffffff',
                headerMuted: '#d0d7de',
                headerActionBg: '#24292f',
                headerActionBorder: '#57606a',
                headerActionHoverBg: '#30363d',
                headerActionHoverBorder: '#8b949e'
            }
        },
        academic: {
            system: 'quarter',
            quarters: ['fall', 'winter', 'spring'],
            defaultTargetYearMode: 'current',
            defaultWorkloadImportYearMode: 'next',
            defaultSchedulerYear: '2025-26'
        },
        scheduler: {
            storageKeyPrefix: 'designSchedulerData_',
            allowedRooms: ['206', '207', '209', '210', '212', 'CEB 102', 'CEB 104']
        },
        workload: {
            dashboardTitle: 'Faculty Workload Dashboard',
            dashboardSubtitleBase: 'EWU Design Department - Academic Workload Analysis',
            productionResetDefaultScheduleYear: '2026-27',
            defaultAnnualTargets: {
                'Full Professor': 36,
                'Associate Professor': 36,
                'Assistant Professor': 36,
                'Tenure/Tenure-track': 36,
                'Senior Lecturer': 45,
                Lecturer: 45,
                Adjunct: 15
            }
        },
        import: {
            clss: {
                roomMatchPriority: ['206', '207', '209', '210', '212', 'CEB 102', 'CEB 104'],
                preferredMatchingOrder: [
                    'course+section+instructor+quarter',
                    'course+quarter+instructor',
                    'course+quarter'
                ]
            }
        }
    });

    const state = {
        initialized: false,
        loadingPromise: null,
        activeProfileId: DEFAULT_PROFILE.id,
        profile: deepClone(DEFAULT_PROFILE),
        source: 'embedded-default',
        warnings: [],
        errors: []
    };

    function deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function isObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    }

    function deepMerge(base, override) {
        if (!isObject(base)) return deepClone(override);
        const merged = deepClone(base);
        if (!isObject(override)) return merged;

        Object.keys(override).forEach((key) => {
            const incoming = override[key];
            if (Array.isArray(incoming)) {
                merged[key] = incoming.slice();
                return;
            }
            if (isObject(incoming) && isObject(merged[key])) {
                merged[key] = deepMerge(merged[key], incoming);
                return;
            }
            merged[key] = incoming;
        });

        return merged;
    }

    function getProfileBasePath() {
        const pathname = String(global.location && global.location.pathname || '').toLowerCase();
        return pathname.includes('/pages/') ? '../department-profiles' : 'department-profiles';
    }

    function readStoredProfileId() {
        try {
            const value = String(global.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY) || '').trim();
            return value || '';
        } catch (error) {
            return '';
        }
    }

    function writeStoredProfileId(profileId) {
        try {
            if (profileId) {
                global.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, String(profileId));
            }
        } catch (error) {
            console.warn('Could not persist active department profile id:', error);
        }
    }

    async function fetchJson(url) {
        try {
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) {
                return { ok: false, error: `HTTP ${response.status}` };
            }
            const parsed = await response.json();
            return { ok: true, value: parsed };
        } catch (error) {
            return { ok: false, error: error && error.message ? error.message : 'fetch failed' };
        }
    }

    function migrateProfile(rawProfile, warnings) {
        const profile = deepClone(rawProfile || {});
        if (!profile.version && profile.version !== 0) {
            profile.version = 1;
            warnings.push('Profile version missing; defaulted to v1.');
        }

        if (profile.version > CURRENT_SCHEMA_VERSION) {
            throw new Error(`Unsupported profile version ${profile.version}. Runtime supports v${CURRENT_SCHEMA_VERSION}.`);
        }

        if (profile.version < 1) {
            throw new Error(`Unsupported legacy profile version ${profile.version}.`);
        }

        profile.version = 1;
        return profile;
    }

    function normalizeProfile(rawProfile) {
        const merged = deepMerge(DEFAULT_PROFILE, rawProfile || {});

        if (!Array.isArray(merged.academic.quarters)) {
            merged.academic.quarters = DEFAULT_PROFILE.academic.quarters.slice();
        }
        merged.academic.quarters = merged.academic.quarters
            .map((quarter) => String(quarter || '').toLowerCase())
            .filter(Boolean);

        if (!Array.isArray(merged.scheduler.allowedRooms)) {
            merged.scheduler.allowedRooms = DEFAULT_PROFILE.scheduler.allowedRooms.slice();
        }
        merged.scheduler.allowedRooms = merged.scheduler.allowedRooms
            .map((room) => String(room || '').trim())
            .filter(Boolean);

        if (!Array.isArray(merged.import.clss.roomMatchPriority)) {
            merged.import.clss.roomMatchPriority = merged.scheduler.allowedRooms.slice();
        }

        return merged;
    }

    function validateProfile(profile) {
        const errors = [];
        const warnings = [];

        if (!isObject(profile)) {
            return { valid: false, errors: ['Profile must be a JSON object.'], warnings };
        }

        if (profile.version !== CURRENT_SCHEMA_VERSION) {
            errors.push(`Profile version must be ${CURRENT_SCHEMA_VERSION}.`);
        }

        if (!String(profile.id || '').trim()) {
            errors.push('Profile id is required.');
        }

        if (!isObject(profile.identity)) {
            errors.push('identity object is required.');
        } else {
            if (!String(profile.identity.name || '').trim()) errors.push('identity.name is required.');
            if (!String(profile.identity.code || '').trim()) errors.push('identity.code is required.');
            if (!String(profile.identity.displayName || '').trim()) errors.push('identity.displayName is required.');
        }

        if (!isObject(profile.academic)) {
            errors.push('academic object is required.');
        } else {
            if (profile.academic.system !== 'quarter') {
                warnings.push('academic.system is not "quarter"; current UI assumes quarter model.');
            }
            if (!Array.isArray(profile.academic.quarters) || profile.academic.quarters.length === 0) {
                errors.push('academic.quarters must be a non-empty array.');
            }
        }

        if (!isObject(profile.scheduler)) {
            errors.push('scheduler object is required.');
        } else {
            if (!String(profile.scheduler.storageKeyPrefix || '').trim()) {
                errors.push('scheduler.storageKeyPrefix is required.');
            }
            if (!Array.isArray(profile.scheduler.allowedRooms) || profile.scheduler.allowedRooms.length === 0) {
                warnings.push('scheduler.allowedRooms is empty; room matching will rely on runtime fallbacks.');
            }
        }

        if (!isObject(profile.workload)) {
            errors.push('workload object is required.');
        } else if (!isObject(profile.workload.defaultAnnualTargets)) {
            warnings.push('workload.defaultAnnualTargets missing; workload UI will fall back to runtime defaults.');
        }

        return { valid: errors.length === 0, errors, warnings };
    }

    async function loadManifest() {
        const manifestPath = `${getProfileBasePath()}/${PROFILE_MANIFEST_FILE}`;
        const response = await fetchJson(manifestPath);
        if (!response.ok || !isObject(response.value)) {
            return {
                ok: false,
                warnings: [`Could not load profile manifest at ${manifestPath} (${response.error || 'unknown error'}).`],
                manifest: {
                    schemaVersion: CURRENT_SCHEMA_VERSION,
                    defaultProfileId: DEFAULT_PROFILE_ID,
                    profiles: [{ id: DEFAULT_PROFILE_ID, file: `${DEFAULT_PROFILE_ID}.json` }]
                }
            };
        }
        return { ok: true, warnings: [], manifest: response.value };
    }

    function resolveManifestEntry(manifest, profileId) {
        if (!manifest || !Array.isArray(manifest.profiles)) return null;
        return manifest.profiles.find((entry) => String(entry.id || '').trim() === profileId) || null;
    }

    async function loadProfileDocument(profileId, manifest) {
        const basePath = getProfileBasePath();
        const entry = resolveManifestEntry(manifest, profileId);
        const profileFile = entry && entry.file ? String(entry.file) : `${profileId}.json`;
        const profilePath = `${basePath}/${profileFile}`;
        const response = await fetchJson(profilePath);
        if (!response.ok) {
            return {
                ok: false,
                profile: null,
                warnings: [`Could not load profile ${profileId} at ${profilePath} (${response.error || 'unknown error'}).`],
                source: 'embedded-default'
            };
        }
        return {
            ok: true,
            profile: response.value,
            warnings: [],
            source: 'json-file'
        };
    }

    function makeSnapshot() {
        return {
            profile: deepClone(state.profile),
            activeProfileId: state.activeProfileId,
            source: state.source,
            warnings: state.warnings.slice(),
            errors: state.errors.slice()
        };
    }

    function toCssTokenName(key) {
        return String(key || '')
            .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
            .replace(/[^a-zA-Z0-9-]+/g, '-')
            .toLowerCase()
            .replace(/^-+/, '')
            .replace(/-+$/, '');
    }

    function applyThemeTokens(profile) {
        const root = global.document && global.document.documentElement ? global.document.documentElement : null;
        if (!root) return;
        const tokens = profile && profile.branding && profile.branding.themeTokens;
        if (!isObject(tokens)) return;

        Object.entries(tokens).forEach(([token, rawValue]) => {
            const value = String(rawValue || '').trim();
            if (!value) return;
            const tokenName = toCssTokenName(token);
            if (!tokenName) return;
            root.style.setProperty(`--pc-${tokenName}`, value);
        });
    }

    function publishActiveProfile(snapshot) {
        global.__PROGRAM_COMMAND_ACTIVE_PROFILE__ = deepClone(snapshot.profile);
        applyThemeTokens(snapshot.profile);
        global.dispatchEvent(new CustomEvent('department-profile-change', { detail: snapshot }));
    }

    async function initialize(options) {
        const config = isObject(options) ? options : {};
        const requestedId = String(config.profileId || '').trim();
        const forceReload = Boolean(config.forceReload);

        if (!forceReload && state.initialized && !requestedId) {
            return makeSnapshot();
        }

        if (!forceReload && state.loadingPromise) {
            return state.loadingPromise;
        }

        state.loadingPromise = (async () => {
            const warnings = [];
            const errors = [];

            const manifestResult = await loadManifest();
            warnings.push(...manifestResult.warnings);

            const manifest = manifestResult.manifest;
            const manifestDefaultId = String(manifest && manifest.defaultProfileId || '').trim() || DEFAULT_PROFILE_ID;
            const storedId = readStoredProfileId();
            const nextProfileId = requestedId || storedId || manifestDefaultId || DEFAULT_PROFILE_ID;

            let loadedResult = await loadProfileDocument(nextProfileId, manifest);
            warnings.push(...loadedResult.warnings);

            let rawProfile = loadedResult.profile;
            let source = loadedResult.source;

            if (!loadedResult.ok || !isObject(rawProfile)) {
                if (nextProfileId !== DEFAULT_PROFILE_ID) {
                    loadedResult = await loadProfileDocument(DEFAULT_PROFILE_ID, manifest);
                    warnings.push(...loadedResult.warnings);
                    rawProfile = loadedResult.profile;
                    source = loadedResult.source;
                }
            }

            if (!isObject(rawProfile)) {
                rawProfile = deepClone(DEFAULT_PROFILE);
                source = 'embedded-default';
                warnings.push('Using embedded fallback profile because no profile file could be loaded.');
            }

            let migratedProfile = null;
            try {
                migratedProfile = migrateProfile(rawProfile, warnings);
            } catch (error) {
                errors.push(error && error.message ? error.message : 'Profile migration failed.');
                migratedProfile = deepClone(DEFAULT_PROFILE);
                source = 'embedded-default';
            }

            const normalizedProfile = normalizeProfile(migratedProfile);
            const validation = validateProfile(normalizedProfile);
            warnings.push(...validation.warnings);
            errors.push(...validation.errors);

            if (!validation.valid) {
                warnings.push('Loaded profile failed validation; using embedded fallback profile.');
                const fallback = normalizeProfile(deepClone(DEFAULT_PROFILE));
                const fallbackValidation = validateProfile(fallback);
                warnings.push(...fallbackValidation.warnings);
                state.profile = fallback;
                state.activeProfileId = fallback.id;
                state.source = 'embedded-default';
                state.errors = errors;
                state.warnings = warnings;
            } else {
                state.profile = normalizedProfile;
                state.activeProfileId = normalizedProfile.id;
                state.source = source || 'json-file';
                state.errors = errors;
                state.warnings = warnings;
            }

            state.initialized = true;
            writeStoredProfileId(state.activeProfileId);
            const snapshot = makeSnapshot();
            publishActiveProfile(snapshot);
            return snapshot;
        })();

        try {
            return await state.loadingPromise;
        } finally {
            state.loadingPromise = null;
        }
    }

    async function setActiveProfile(profileId) {
        const normalized = String(profileId || '').trim();
        if (!normalized) throw new Error('Profile id is required.');
        writeStoredProfileId(normalized);
        return initialize({ profileId: normalized, forceReload: true });
    }

    function getValidationReport(profile) {
        const candidate = profile ? normalizeProfile(profile) : deepClone(state.profile);
        const validation = validateProfile(candidate);
        return {
            valid: validation.valid,
            errors: validation.errors,
            warnings: validation.warnings,
            normalizedProfile: candidate
        };
    }

    global.DepartmentProfileManager = {
        CURRENT_SCHEMA_VERSION,
        ACTIVE_PROFILE_STORAGE_KEY,
        DEFAULT_PROFILE_ID,
        getProfileBasePath,
        getDefaultProfile: function getDefaultProfile() {
            return deepClone(DEFAULT_PROFILE);
        },
        getCurrentProfile: function getCurrentProfile() {
            return deepClone(state.profile);
        },
        getCurrentSnapshot: makeSnapshot,
        getActiveProfileId: function getActiveProfileId() {
            return state.activeProfileId;
        },
        getStoredProfileId: readStoredProfileId,
        setActiveProfile,
        initialize,
        validateProfile: getValidationReport,
        resetCache: function resetCache() {
            state.initialized = false;
            state.loadingPromise = null;
            state.profile = deepClone(DEFAULT_PROFILE);
            state.activeProfileId = DEFAULT_PROFILE.id;
            state.source = 'embedded-default';
            state.warnings = [];
            state.errors = [];
        }
    };
})(window);
