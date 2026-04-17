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
        programId: null,
        programCode: null
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

    function readJsonStorageKey(storageKey) {
        if (typeof window === 'undefined' || !window.localStorage) return null;
        try {
            const raw = window.localStorage.getItem(storageKey);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return null;
        }
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

    function buildProgramCodeCandidates(context = {}) {
        const candidates = [];
        const addCandidate = (value) => {
            const normalized = slugifyProgramValue(value);
            if (!normalized || candidates.includes(normalized)) return;
            candidates.push(normalized);
        };

        addCandidate(context?.selection?.id);
        addCandidate(context?.selection?.departmentId);
        addCandidate(context?.selection?.label);
        addCandidate(context?.selection?.identityName);
        addCandidate(context?.selection?.departmentLabel);
        addCandidate(context?.selection?.suggestedCode);
        addCandidate(context?.profile?.identity?.displayName);
        addCandidate(context?.profile?.identity?.name);
        addCandidate(context?.profile?.identity?.code);
        addCandidate(context?.suggestedIdentity?.displayName);
        addCandidate(context?.suggestedIdentity?.name);
        addCandidate(context?.suggestedIdentity?.code);

        const identityCode = String(context?.suggestedIdentity?.code || context?.profile?.identity?.code || '').trim().toUpperCase();
        const identityName = String(context?.suggestedIdentity?.name || context?.profile?.identity?.name || '').trim().toLowerCase();
        if (identityCode === 'DESN' || identityName === 'design') {
            addCandidate('ewu-design');
        }

        return candidates.length ? candidates : ['ewu-design'];
    }

    function getLocalRuntimeContext() {
        if (typeof window !== 'undefined' && typeof window.getProgramCommandRuntimeContext === 'function') {
            try {
                const runtimeContext = window.getProgramCommandRuntimeContext();
                if (runtimeContext && runtimeContext.source && runtimeContext.source !== 'active-profile') {
                    return runtimeContext;
                }
            } catch (error) {
                // fall back to local context discovery below
            }
        }

        const selection = (typeof window !== 'undefined'
            && window.ProgramCommandShell
            && typeof window.ProgramCommandShell.readSelection === 'function')
            ? window.ProgramCommandShell.readSelection()
            : readJsonStorageKey('programCommandShellSelectionV1');

        if (selection) {
            return {
                source: 'shell-selection',
                programCodeCandidates: buildProgramCodeCandidates({
                    selection,
                    suggestedIdentity: selection.suggestedIdentity || {
                        code: selection.suggestedCode,
                        name: selection.identityName || selection.label || selection.departmentLabel,
                        displayName: selection.identityDisplayName
                    }
                })
            };
        }

        const onboardingContext = (typeof window !== 'undefined'
            && window.ProgramCommandShell
            && typeof window.ProgramCommandShell.readOnboardingContext === 'function')
            ? window.ProgramCommandShell.readOnboardingContext()
            : readJsonStorageKey('programCommandOnboardingContextV1');

        if (onboardingContext) {
            return {
                source: 'onboarding-context',
                programCodeCandidates: buildProgramCodeCandidates({
                    selection: onboardingContext,
                    suggestedIdentity: onboardingContext.suggestedIdentity || {
                        code: onboardingContext.suggestedCode,
                        name: onboardingContext.identityName || onboardingContext.label || onboardingContext.departmentLabel,
                        displayName: onboardingContext.identityDisplayName
                    }
                })
            };
        }

        return {
            source: 'design-bootstrap-default',
            programCodeCandidates: ['ewu-design']
        };
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

    async function resolveProgramTarget(explicitProgramId = null, options = {}) {
        const explicitId = explicitProgramId ? String(explicitProgramId) : null;
        if (explicitId) {
            return {
                programId: explicitId,
                programCodes: [],
                source: 'explicit-program-id'
            };
        }

        const authProgramId = await resolveProgramId(explicitProgramId);
        if (authProgramId) {
            return {
                programId: authProgramId,
                programCodes: [],
                source: 'auth-program-id'
            };
        }

        const authService = (typeof window !== 'undefined' && window.AuthService) ? window.AuthService : null;
        if (authService && typeof authService.getUser === 'function') {
            try {
                const user = await authService.getUser();
                const metadataProgramCode = user?.app_metadata?.program_code || user?.user_metadata?.program_code || null;
                if (metadataProgramCode) {
                    return {
                        programId: null,
                        programCodes: [slugifyProgramValue(metadataProgramCode)],
                        source: 'auth-program-code'
                    };
                }
            } catch (error) {
                // ignore auth metadata failures
            }
        }

        const profileHint = isObject(options?.profileHint) ? options.profileHint : null;
        if (profileHint) {
            const hintedProgramCodes = buildProgramCodeCandidates({
                profile: profileHint
            });
            if (hintedProgramCodes.length) {
                return {
                    programId: null,
                    programCodes: hintedProgramCodes,
                    source: 'profile-hint'
                };
            }
        }

        const runtimeContext = getLocalRuntimeContext();
        const runtimeSource = runtimeContext.source || 'runtime-context';
        const programCodes = Array.isArray(runtimeContext.programCodeCandidates) && runtimeContext.programCodeCandidates.length
            ? runtimeContext.programCodeCandidates
            : [];

        return {
            programId: null,
            programCodes: runtimeSource === 'design-bootstrap-default' ? [] : programCodes,
            source: runtimeSource
        };
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

    async function loadFromSupabase(explicitProgramId = null, options = {}) {
        const client = getClient();
        if (!client || typeof client.from !== 'function') {
            return null;
        }

        const target = await resolveProgramTarget(explicitProgramId, options);
        if (target.programId) {
            const { data, error } = await client
                .from('programs')
                .select('id, code, config')
                .eq('id', target.programId)
                .limit(1);

            if (error || !Array.isArray(data) || !data.length) {
                return null;
            }

            const row = data[0];

            const profile = normalizeLoadedProfile(row.config);
            if (!isObject(profile)) {
                return null;
            }

            return {
                programId: row.id || target.programId || null,
                programCode: row.code || null,
                profile
            };
        }

        const candidateCodes = Array.isArray(target.programCodes) && target.programCodes.length
            ? target.programCodes
            : [];

        if (!candidateCodes.length) {
            return null;
        }

        for (const code of candidateCodes) {
            const { data, error } = await client
                .from('programs')
                .select('id, code, config')
                .eq('code', code)
                .limit(1);

            if (error) {
                return null;
            }

            const row = Array.isArray(data) ? data[0] : null;
            if (!row) continue;

            const profile = normalizeLoadedProfile(row.config);
            if (!isObject(profile)) continue;

            return {
                programId: row.id || null,
                programCode: row.code || code,
                profile
            };
        }

        return null;
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
            let fromSupabase = null;

            try {
                fromSupabase = await loadFromSupabase(requestedProgramId, config);
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
            state.programCode = fromSupabase?.programCode || null;
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
            programCode: state.programCode,
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
        state.programCode = null;
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
