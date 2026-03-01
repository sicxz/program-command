/*
 * Department profile runtime loader/validator (v1)
 * Provides a lightweight config foundation for multi-department onboarding.
 */
(function departmentProfileRuntime(global) {
    'use strict';

    const ACTIVE_PROFILE_STORAGE_KEY = 'programCommandActiveDepartmentProfileId';
    const CUSTOM_PROFILES_STORAGE_KEY = 'programCommandCustomDepartmentProfilesV1';
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
            logoUrl: '',
            brandColor: '#a10022',
            headerEyebrow: 'EWU DESIGN · PROGRAM COMMAND',
            headerSubtitle: 'Design Program Planning, Scheduling, and Scenario Control',
            textSlots: {
                navAnalyticsLabel: 'Analytics',
                navPlanningLabel: 'Planning',
                navToolsLabel: 'Tools',
                onboardingTitle: 'Department Onboarding Shell',
                onboardingSubtitle: 'Create and activate a versioned department profile without code edits for standard setup',
                onboardingStep1Title: 'Step 1: Entry + Base Profile',
                onboardingStep1Help: 'Select an existing profile as your base, then define department identity.',
                onboardingStep2Title: 'Step 2: Seed Mapping Wizard',
                onboardingStep2Help: 'Enter room map and CLSS alias mappings. Use one item per line. Alias format: alias=canonical.',
                onboardingStep3Title: 'Step 3: Health Checks + Activation',
                onboardingStep3Help: 'Run checks before activation. Errors block activation. Warnings are advisory.',
                onboardingStatusTitle: 'Current Status'
            },
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
            yearLabelFormat: 'YYYY-YY',
            defaultTargetYearMode: 'current',
            defaultWorkloadImportYearMode: 'next',
            defaultSchedulerYear: '2025-26'
        },
        scheduler: {
            storageKeyPrefix: 'designSchedulerData_',
            allowedRooms: ['206', '207', '209', '210', '212', 'CEB 102', 'CEB 104'],
            dayPatterns: [
                { id: 'MW', label: 'Monday / Wednesday', aliases: ['MW', 'WM'] },
                { id: 'TR', label: 'Tuesday / Thursday', aliases: ['TR', 'RT', 'TH', 'TTH'] }
            ],
            timeSlots: [
                { id: '10:00-12:20', label: '10:00-12:20', aliases: ['10:00-12:00'], startMinutes: 600, endMinutes: 740 },
                { id: '13:00-15:20', label: '13:00-15:20', aliases: ['13:00-15:00'], startMinutes: 780, endMinutes: 920 },
                { id: '16:00-18:20', label: '16:00-18:20', aliases: ['16:00-18:00'], startMinutes: 960, endMinutes: 1100 }
            ],
            roomLabels: {
                '206': '206 UX Lab',
                '207': '207 Media Lab',
                '209': '209 Mac Lab',
                '210': '210 Mac Lab',
                '212': '212 Project Lab',
                'CEB 102': 'CEB 102',
                'CEB 104': 'CEB 104'
            }
        },
        workload: {
            dashboardTitle: 'Faculty Workload Dashboard',
            dashboardSubtitleBase: 'EWU Design Department - Academic Workload Analysis',
            productionResetDefaultScheduleYear: '2026-27',
            utilizationThresholds: {
                overloadedPercent: 100,
                optimalMinPercent: 60
            },
            courseTypeMultipliers: {
                scheduled: 1,
                independentStudy: 0.2,
                seniorProject: 0.2,
                internship: 0.1,
                practicum: 0.2
            },
            appliedLearningCourses: {
                'DESN 399': { title: 'Independent Study', rate: 0.2 },
                'DESN 491': { title: 'Senior Project', rate: 0.2 },
                'DESN 495': { title: 'Internship', rate: 0.1 },
                'DESN 499': { title: 'Independent Study', rate: 0.2 }
            },
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
                ],
                facultyAliases: {},
                courseAliases: {}
            }
        },
        courseModel: {
            courseCodePrefix: 'DESN',
            catalogStructure: 'course-catalog.json'
        },
        dashboard: {
            modules: {
                schedule: true,
                workload: true,
                capacity: true,
                releaseTime: true,
                constraints: true,
                onboarding: true
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

    function readCustomProfilesStore() {
        try {
            const raw = global.localStorage.getItem(CUSTOM_PROFILES_STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return isObject(parsed) ? parsed : {};
        } catch (error) {
            console.warn('Could not read custom profile store:', error);
            return {};
        }
    }

    function writeCustomProfilesStore(store) {
        try {
            const safeStore = isObject(store) ? store : {};
            global.localStorage.setItem(CUSTOM_PROFILES_STORAGE_KEY, JSON.stringify(safeStore));
        } catch (error) {
            console.warn('Could not persist custom profile store:', error);
        }
    }

    function sanitizeProfileBaseId(rawValue) {
        const normalized = String(rawValue || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+/, '')
            .replace(/-+$/, '');
        return normalized || 'department';
    }

    function escapeRegExp(text) {
        return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function getNextVersionedProfileId(baseId, existingIds) {
        const prefix = sanitizeProfileBaseId(baseId);
        const pattern = new RegExp(`^${escapeRegExp(prefix)}-v(\\d+)$`, 'i');
        let maxVersion = 0;
        (Array.isArray(existingIds) ? existingIds : []).forEach((candidateId) => {
            const match = String(candidateId || '').match(pattern);
            if (!match) return;
            const version = Number(match[1]);
            if (Number.isFinite(version) && version > maxVersion) {
                maxVersion = version;
            }
        });
        return `${prefix}-v${String(maxVersion + 1).padStart(2, '0')}`;
    }

    function readCustomProfile(profileId) {
        const normalizedId = String(profileId || '').trim();
        if (!normalizedId) return null;
        const store = readCustomProfilesStore();
        const entry = store[normalizedId];
        if (!entry) return null;
        if (isObject(entry.profile)) return deepClone(entry.profile);
        if (isObject(entry)) return deepClone(entry);
        return null;
    }

    function listCustomProfileEntries() {
        const store = readCustomProfilesStore();
        return Object.entries(store)
            .map(([id, entry]) => {
                const profile = isObject(entry?.profile) ? entry.profile : (isObject(entry) ? entry : null);
                if (!profile) return null;
                return {
                    id,
                    source: 'custom-local',
                    savedAt: String(entry?.savedAt || entry?.updatedAt || '').trim() || null,
                    baseId: String(entry?.baseId || '').trim() || null,
                    profile: deepClone(profile)
                };
            })
            .filter(Boolean)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)));
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
        if (!String(merged.academic.yearLabelFormat || '').trim()) {
            merged.academic.yearLabelFormat = DEFAULT_PROFILE.academic.yearLabelFormat;
        }

        if (!isObject(merged.branding.textSlots)) {
            merged.branding.textSlots = { ...DEFAULT_PROFILE.branding.textSlots };
        }
        if (!String(merged.branding.logoUrl || '').trim() && DEFAULT_PROFILE.branding.logoUrl) {
            merged.branding.logoUrl = DEFAULT_PROFILE.branding.logoUrl;
        }
        if (!String(merged.branding.brandColor || '').trim()) {
            merged.branding.brandColor = DEFAULT_PROFILE.branding.brandColor;
        }

        if (!Array.isArray(merged.scheduler.allowedRooms)) {
            merged.scheduler.allowedRooms = DEFAULT_PROFILE.scheduler.allowedRooms.slice();
        }
        merged.scheduler.allowedRooms = merged.scheduler.allowedRooms
            .map((room) => String(room || '').trim())
            .filter(Boolean);

        if (!Array.isArray(merged.scheduler.dayPatterns) || merged.scheduler.dayPatterns.length === 0) {
            merged.scheduler.dayPatterns = DEFAULT_PROFILE.scheduler.dayPatterns.slice();
        }

        if (!Array.isArray(merged.scheduler.timeSlots) || merged.scheduler.timeSlots.length === 0) {
            merged.scheduler.timeSlots = DEFAULT_PROFILE.scheduler.timeSlots.slice();
        }

        if (!isObject(merged.scheduler.roomLabels)) {
            merged.scheduler.roomLabels = { ...DEFAULT_PROFILE.scheduler.roomLabels };
        }

        if (!Array.isArray(merged.import.clss.roomMatchPriority)) {
            merged.import.clss.roomMatchPriority = merged.scheduler.allowedRooms.slice();
        }

        if (!isObject(merged.import.clss.facultyAliases)) {
            merged.import.clss.facultyAliases = {};
        }

        if (!isObject(merged.import.clss.courseAliases)) {
            merged.import.clss.courseAliases = {};
        }

        if (!isObject(merged.workload.appliedLearningCourses)) {
            merged.workload.appliedLearningCourses = deepClone(DEFAULT_PROFILE.workload.appliedLearningCourses);
        }

        if (!isObject(merged.workload.utilizationThresholds)) {
            merged.workload.utilizationThresholds = deepClone(DEFAULT_PROFILE.workload.utilizationThresholds);
        }

        if (!isObject(merged.workload.courseTypeMultipliers)) {
            merged.workload.courseTypeMultipliers = deepClone(DEFAULT_PROFILE.workload.courseTypeMultipliers);
        }

        if (!isObject(merged.courseModel)) {
            merged.courseModel = deepClone(DEFAULT_PROFILE.courseModel);
        }

        if (!isObject(merged.dashboard)) {
            merged.dashboard = deepClone(DEFAULT_PROFILE.dashboard);
        }
        if (!isObject(merged.dashboard.modules)) {
            merged.dashboard.modules = deepClone(DEFAULT_PROFILE.dashboard.modules);
        }

        return merged;
    }

    function validateProfile(profile) {
        const errors = [];
        const warnings = [];
        const hexColorPattern = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

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
            if (typeof profile.identity.name !== 'string' || !profile.identity.name.trim()) errors.push('identity.name must be a non-empty string.');
            if (typeof profile.identity.code !== 'string' || !profile.identity.code.trim()) errors.push('identity.code must be a non-empty string.');
            if (typeof profile.identity.displayName !== 'string' || !profile.identity.displayName.trim()) errors.push('identity.displayName must be a non-empty string.');
            if (profile.identity.shortName != null && typeof profile.identity.shortName !== 'string') {
                errors.push('identity.shortName must be a string when provided.');
            }
        }

        if (!isObject(profile.branding)) {
            errors.push('branding object is required.');
        } else {
            if (profile.branding.logoUrl != null && typeof profile.branding.logoUrl !== 'string') {
                errors.push('branding.logoUrl must be a string when provided.');
            }
            if (profile.branding.brandColor != null && (typeof profile.branding.brandColor !== 'string' || !hexColorPattern.test(profile.branding.brandColor))) {
                errors.push('branding.brandColor must be a valid hex color (for example #a10022).');
            }
            if (!isObject(profile.branding.textSlots)) {
                warnings.push('branding.textSlots should be an object map of UI labels.');
            }
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
            if (typeof profile.academic.yearLabelFormat !== 'string' || !profile.academic.yearLabelFormat.trim()) {
                errors.push('academic.yearLabelFormat must be a non-empty string.');
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
        } else {
            if (!isObject(profile.workload.defaultAnnualTargets)) {
                warnings.push('workload.defaultAnnualTargets missing; workload UI will fall back to runtime defaults.');
            }
            if (!isObject(profile.workload.appliedLearningCourses)) {
                errors.push('workload.appliedLearningCourses must be an object map.');
            }
            if (!isObject(profile.workload.courseTypeMultipliers)) {
                errors.push('workload.courseTypeMultipliers must be an object map.');
            }
            if (!isObject(profile.workload.utilizationThresholds)) {
                errors.push('workload.utilizationThresholds must be an object.');
            } else {
                const overloadedPercent = Number(profile.workload.utilizationThresholds.overloadedPercent);
                const optimalMinPercent = Number(profile.workload.utilizationThresholds.optimalMinPercent);
                if (!Number.isFinite(overloadedPercent) || overloadedPercent <= 0) {
                    errors.push('workload.utilizationThresholds.overloadedPercent must be a positive number.');
                }
                if (!Number.isFinite(optimalMinPercent) || optimalMinPercent <= 0) {
                    errors.push('workload.utilizationThresholds.optimalMinPercent must be a positive number.');
                }
            }
        }

        if (!isObject(profile.courseModel)) {
            errors.push('courseModel object is required.');
        } else {
            if (typeof profile.courseModel.courseCodePrefix !== 'string' || !profile.courseModel.courseCodePrefix.trim()) {
                errors.push('courseModel.courseCodePrefix must be a non-empty string.');
            }
            if (profile.courseModel.catalogStructure != null && typeof profile.courseModel.catalogStructure !== 'string') {
                errors.push('courseModel.catalogStructure must be a string when provided.');
            }
        }

        if (!isObject(profile.dashboard) || !isObject(profile.dashboard.modules)) {
            errors.push('dashboard.modules object is required.');
        } else {
            Object.entries(profile.dashboard.modules).forEach(([moduleName, enabled]) => {
                if (typeof enabled !== 'boolean') {
                    errors.push(`dashboard.modules.${moduleName} must be a boolean.`);
                }
            });
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

    function parseHexColorToRgb(value) {
        const input = String(value || '').trim();
        if (!input.startsWith('#')) return null;
        const hex = input.slice(1);
        if (hex.length === 3 && /^[0-9a-fA-F]{3}$/.test(hex)) {
            return {
                r: parseInt(hex[0] + hex[0], 16),
                g: parseInt(hex[1] + hex[1], 16),
                b: parseInt(hex[2] + hex[2], 16)
            };
        }
        if (hex.length === 6 && /^[0-9a-fA-F]{6}$/.test(hex)) {
            return {
                r: parseInt(hex.slice(0, 2), 16),
                g: parseInt(hex.slice(2, 4), 16),
                b: parseInt(hex.slice(4, 6), 16)
            };
        }
        return null;
    }

    function toRelativeLuminance(rgb) {
        const convert = (channel) => {
            const normalized = channel / 255;
            return normalized <= 0.03928
                ? normalized / 12.92
                : Math.pow((normalized + 0.055) / 1.055, 2.4);
        };
        const r = convert(rgb.r);
        const g = convert(rgb.g);
        const b = convert(rgb.b);
        return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
    }

    function contrastRatio(foregroundHex, backgroundHex) {
        const fg = parseHexColorToRgb(foregroundHex);
        const bg = parseHexColorToRgb(backgroundHex);
        if (!fg || !bg) return null;
        const fgL = toRelativeLuminance(fg);
        const bgL = toRelativeLuminance(bg);
        const lighter = Math.max(fgL, bgL);
        const darker = Math.min(fgL, bgL);
        return (lighter + 0.05) / (darker + 0.05);
    }

    function evaluateBrandingAccessibility(profile) {
        const warnings = [];
        const tokens = profile && profile.branding && profile.branding.themeTokens;
        if (!isObject(tokens)) return warnings;

        const foreground = tokens.headerForeground;
        const top = tokens.headerTop;
        const bottom = tokens.headerBottom;
        const minContrast = 4.5;

        const topContrast = contrastRatio(foreground, top);
        if (Number.isFinite(topContrast) && topContrast < minContrast) {
            warnings.push(`branding.themeTokens contrast warning: headerForeground vs headerTop is ${topContrast.toFixed(2)} (< ${minContrast}).`);
        }

        const bottomContrast = contrastRatio(foreground, bottom);
        if (Number.isFinite(bottomContrast) && bottomContrast < minContrast) {
            warnings.push(`branding.themeTokens contrast warning: headerForeground vs headerBottom is ${bottomContrast.toFixed(2)} (< ${minContrast}).`);
        }

        return warnings;
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

            const customProfile = readCustomProfile(nextProfileId);
            let loadedResult = null;
            if (customProfile && isObject(customProfile)) {
                loadedResult = {
                    ok: true,
                    profile: customProfile,
                    warnings: [`Loaded custom local profile ${nextProfileId}.`],
                    source: 'custom-local'
                };
            } else {
                loadedResult = await loadProfileDocument(nextProfileId, manifest);
            }
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
                warnings.push(...evaluateBrandingAccessibility(fallback));
                state.profile = fallback;
                state.activeProfileId = fallback.id;
                state.source = 'embedded-default';
                state.errors = errors;
                state.warnings = warnings;
            } else {
                warnings.push(...evaluateBrandingAccessibility(normalizedProfile));
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

    async function loadProfile(profileId) {
        const normalizedId = String(profileId || '').trim();
        if (!normalizedId) {
            throw new Error('Profile id is required.');
        }

        const warnings = [];
        const errors = [];
        const manifestResult = await loadManifest();
        warnings.push(...(manifestResult.warnings || []));
        const manifest = manifestResult.manifest;

        const customProfile = readCustomProfile(normalizedId);
        let source = 'json-file';
        let rawProfile = null;
        if (customProfile) {
            rawProfile = customProfile;
            source = 'custom-local';
        } else {
            const loaded = await loadProfileDocument(normalizedId, manifest);
            warnings.push(...(loaded.warnings || []));
            rawProfile = loaded.profile;
            source = loaded.source;
        }

        if (!isObject(rawProfile)) {
            rawProfile = deepClone(DEFAULT_PROFILE);
            source = 'embedded-default';
            warnings.push(`Could not resolve ${normalizedId}; using default profile.`);
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
        warnings.push(...evaluateBrandingAccessibility(normalizedProfile));
        errors.push(...validation.errors);

        return {
            profile: normalizedProfile,
            source,
            warnings,
            errors,
            valid: validation.valid
        };
    }

    async function listProfiles() {
        const manifestResult = await loadManifest();
        const manifest = manifestResult.manifest || {};
        const manifestProfiles = Array.isArray(manifest.profiles) ? manifest.profiles : [];
        const discovered = [];

        manifestProfiles.forEach((entry) => {
            const id = String(entry?.id || '').trim();
            if (!id) return;
            discovered.push({
                id,
                file: entry.file ? String(entry.file) : `${id}.json`,
                source: 'manifest'
            });
        });

        const custom = listCustomProfileEntries().map((entry) => ({
            id: entry.id,
            file: null,
            source: entry.source,
            savedAt: entry.savedAt,
            baseId: entry.baseId
        }));

        const mergedMap = new Map();
        [...discovered, ...custom].forEach((entry) => {
            if (!entry || !entry.id) return;
            mergedMap.set(entry.id, entry);
        });

        return {
            profiles: [...mergedMap.values()].sort((a, b) => String(a.id).localeCompare(String(b.id))),
            warnings: manifestResult.warnings || []
        };
    }

    async function saveCustomProfile(rawProfile, options) {
        const config = isObject(options) ? options : {};
        if (!isObject(rawProfile)) {
            throw new Error('Profile payload must be an object.');
        }

        const store = readCustomProfilesStore();
        const baseId = sanitizeProfileBaseId(config.baseId || rawProfile.id || rawProfile.identity?.code || 'department');
        const nextProfileId = getNextVersionedProfileId(baseId, Object.keys(store));

        const normalizedCandidate = normalizeProfile(rawProfile);
        normalizedCandidate.id = nextProfileId;
        normalizedCandidate.version = CURRENT_SCHEMA_VERSION;

        const validation = validateProfile(normalizedCandidate);
        if (!validation.valid) {
            throw new Error(`Profile validation failed: ${validation.errors.join(' | ')}`);
        }

        const entry = {
            profile: normalizedCandidate,
            baseId,
            savedAt: new Date().toISOString()
        };
        store[nextProfileId] = entry;
        writeCustomProfilesStore(store);

        let snapshot = null;
        if (config.activate !== false) {
            snapshot = await setActiveProfile(nextProfileId);
        }

        return {
            profileId: nextProfileId,
            profile: deepClone(normalizedCandidate),
            validation,
            entry: deepClone(entry),
            snapshot
        };
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
        CUSTOM_PROFILES_STORAGE_KEY,
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
        listProfiles,
        loadProfile,
        setActiveProfile,
        saveCustomProfile,
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
