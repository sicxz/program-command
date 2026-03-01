/**
 * ProfileLoader runtime singleton
 * Loads program profile config from Supabase with in-memory caching and safe fallback defaults.
 */
const ProfileLoader = (function() {
    'use strict';

    const DEFAULT_PROFILE = Object.freeze({
        version: 1,
        id: 'design-v1',
        identity: {
            name: 'Design',
            code: 'DESN',
            displayName: 'EWU Design',
            shortName: 'Design'
        },
        scheduler: {
            storageKeyPrefix: 'designSchedulerData_'
        },
        workload: {
            defaultAnnualTargets: {
                'Full Professor': 36,
                'Associate Professor': 36,
                'Assistant Professor': 36,
                'Tenure/Tenure-track': 36,
                'Senior Lecturer': 45,
                Lecturer: 45,
                Adjunct: 15
            },
            appliedLearningCourses: {
                'DESN 399': { title: 'Independent Study', rate: 0.2 },
                'DESN 491': { title: 'Senior Project', rate: 0.2 },
                'DESN 495': { title: 'Internship', rate: 0.1 },
                'DESN 499': { title: 'Independent Study', rate: 0.2 }
            },
            courseTypeMultipliers: {
                scheduled: 1,
                independentStudy: 0.2,
                seniorProject: 0.2,
                internship: 0.1,
                practicum: 0.2
            },
            utilizationThresholds: {
                overloadedPercent: 100,
                optimalMinPercent: 60
            }
        },
        faculty: {
            ranks: {
                professor: { limit: 36 },
                associateProfessor: { limit: 36 },
                assistantProfessor: { limit: 36 },
                seniorLecturer: { limit: 45 },
                lecturer: { limit: 45 },
                adjunct: { limit: 15 }
            }
        }
    });

    const state = {
        loaded: false,
        loadingPromise: null,
        profile: deepClone(DEFAULT_PROFILE),
        source: 'fallback-default',
        programId: null
    };

    function deepClone(value) {
        return value ? JSON.parse(JSON.stringify(value)) : value;
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

    function getClient() {
        if (typeof getSupabaseClient === 'function') {
            return getSupabaseClient();
        }
        if (typeof window !== 'undefined' && typeof window.getSupabaseClient === 'function') {
            return window.getSupabaseClient();
        }
        return null;
    }

    async function resolveProgramId(explicitProgramId = null) {
        if (explicitProgramId) return String(explicitProgramId);

        const authService = (typeof window !== 'undefined' && window.AuthService) ? window.AuthService : null;
        if (!authService || typeof authService.getUser !== 'function') return null;

        try {
            const user = await authService.getUser();
            const metadataProgramId = user?.app_metadata?.program_id || user?.user_metadata?.program_id || null;
            return metadataProgramId ? String(metadataProgramId) : null;
        } catch (error) {
            return null;
        }
    }

    function normalizeLoadedProfile(rawProgramConfig) {
        if (!isObject(rawProgramConfig)) return null;

        if (isObject(rawProgramConfig.profile)) {
            return rawProgramConfig.profile;
        }

        return rawProgramConfig;
    }

    function ensureDerivedFacultyLimits(profile) {
        const result = deepClone(profile);
        if (!isObject(result.faculty)) result.faculty = {};
        if (!isObject(result.faculty.ranks)) result.faculty.ranks = {};

        const targets = isObject(result.workload?.defaultAnnualTargets)
            ? result.workload.defaultAnnualTargets
            : {};

        const mapping = [
            ['Full Professor', 'professor'],
            ['Associate Professor', 'associateProfessor'],
            ['Assistant Professor', 'assistantProfessor'],
            ['Senior Lecturer', 'seniorLecturer'],
            ['Lecturer', 'lecturer'],
            ['Adjunct', 'adjunct']
        ];

        mapping.forEach(([targetKey, rankKey]) => {
            if (!isObject(result.faculty.ranks[rankKey])) {
                result.faculty.ranks[rankKey] = {};
            }
            const fallback = Number(targets[targetKey]);
            if (Number.isFinite(fallback) && fallback > 0) {
                result.faculty.ranks[rankKey].limit = fallback;
                return;
            }
            if (!Number.isFinite(Number(result.faculty.ranks[rankKey].limit))) {
                result.faculty.ranks[rankKey].limit = DEFAULT_PROFILE.faculty.ranks[rankKey].limit;
            }
        });

        return result;
    }

    async function loadFromSupabase(explicitProgramId = null) {
        const client = getClient();
        if (!client || typeof client.from !== 'function') {
            return null;
        }

        const resolvedProgramId = await resolveProgramId(explicitProgramId);
        let query = client.from('programs').select('id, code, config');
        if (resolvedProgramId) {
            query = query.eq('id', resolvedProgramId);
        } else {
            query = query.eq('code', 'ewu-design');
        }

        const { data, error } = await query.maybeSingle();
        if (error || !data) {
            return null;
        }

        const profile = normalizeLoadedProfile(data.config);
        if (!isObject(profile)) {
            return null;
        }

        return {
            programId: data.id || resolvedProgramId || null,
            profile
        };
    }

    function resolveRuntimeDefaultProfile() {
        if (typeof window !== 'undefined' &&
            window.DepartmentProfileManager &&
            typeof window.DepartmentProfileManager.getDefaultProfile === 'function') {
            try {
                const runtimeDefault = window.DepartmentProfileManager.getDefaultProfile();
                if (isObject(runtimeDefault)) {
                    return runtimeDefault;
                }
            } catch (error) {
                // fall back to embedded default
            }
        }
        return deepClone(DEFAULT_PROFILE);
    }

    async function init(programId = null, options = {}) {
        const config = isObject(options) ? options : {};
        const forceRefresh = Boolean(config.forceRefresh);
        const requestedProgramId = programId ? String(programId) : null;

        if (!forceRefresh && state.loaded && state.programId === requestedProgramId) {
            return getSnapshot();
        }

        if (!forceRefresh && state.loadingPromise) {
            return state.loadingPromise;
        }

        state.loadingPromise = (async () => {
            let profile = resolveRuntimeDefaultProfile();
            let source = 'fallback-default';
            let resolvedProgramId = requestedProgramId;

            try {
                const fromSupabase = await loadFromSupabase(requestedProgramId);
                if (fromSupabase && isObject(fromSupabase.profile)) {
                    profile = deepMerge(profile, fromSupabase.profile);
                    resolvedProgramId = fromSupabase.programId || resolvedProgramId;
                    source = 'supabase-programs';
                }
            } catch (error) {
                // keep fallback profile if Supabase read fails
            }

            profile = ensureDerivedFacultyLimits(profile);
            state.profile = profile;
            state.source = source;
            state.programId = resolvedProgramId || null;
            state.loaded = true;
            return getSnapshot();
        })();

        try {
            return await state.loadingPromise;
        } finally {
            state.loadingPromise = null;
        }
    }

    function getSnapshot() {
        return {
            loaded: state.loaded,
            source: state.source,
            programId: state.programId,
            profile: deepClone(state.profile)
        };
    }

    function get(path, fallbackValue = undefined) {
        const normalizedPath = String(path || '').trim();
        if (!normalizedPath) return fallbackValue;

        const parts = normalizedPath.split('.').filter(Boolean);
        let cursor = state.profile;

        for (const part of parts) {
            if (!cursor || typeof cursor !== 'object' || !(part in cursor)) {
                return fallbackValue;
            }
            cursor = cursor[part];
        }

        return cursor === undefined ? fallbackValue : cursor;
    }

    function getAll() {
        return deepClone(state.profile);
    }

    function isLoaded() {
        return state.loaded;
    }

    function resetForTests() {
        state.loaded = false;
        state.loadingPromise = null;
        state.profile = deepClone(DEFAULT_PROFILE);
        state.source = 'fallback-default';
        state.programId = null;
    }

    return {
        init,
        get,
        getAll,
        isLoaded,
        _resetForTests: resetForTests
    };
})();

if (typeof window !== 'undefined') {
    window.ProfileLoader = ProfileLoader;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProfileLoader;
}
