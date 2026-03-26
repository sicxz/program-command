(function programShellModule(global) {
    'use strict';

    const SHELL_SELECTION_STORAGE_KEY = 'programCommandShellSelectionV1';
    const ONBOARDING_CONTEXT_STORAGE_KEY = 'programCommandOnboardingContextV1';

    const DEFAULT_PROGRAM_GROUPS = Object.freeze([
        {
            id: 'departments-programs',
            title: 'Departments & Programs',
            entries: [
                {
                    type: 'program',
                    id: 'biology',
                    label: 'Biology',
                    suggestedCode: 'BIOL',
                    baseProfileId: 'design-v1'
                },
                {
                    type: 'program',
                    id: 'chemistry-biochemistry',
                    label: 'Chemistry & Biochemistry',
                    suggestedCode: 'CHEM',
                    baseProfileId: 'design-v1'
                },
                {
                    type: 'department',
                    title: 'Computer Science, Cybersecurity & Electrical Engineering',
                    items: [
                        {
                            id: 'csee-department',
                            label: 'Department view',
                            identityName: 'Computer Science, Cybersecurity & Electrical Engineering',
                            identityShortName: 'CSEE Department',
                            suggestedCode: 'CSEE',
                            departmentId: 'csee',
                            departmentLabel: 'Computer Science, Cybersecurity & Electrical Engineering',
                            workspaceKind: 'department',
                            workspaceSummary: 'Master department view',
                            baseProfileId: 'design-v1'
                        },
                        {
                            id: 'computer-science-cybersecurity',
                            label: 'Computer Science + Cybersecurity',
                            identityName: 'Computer Science + Cybersecurity',
                            identityShortName: 'CS + Cyber',
                            suggestedCode: 'CSCY',
                            departmentId: 'csee',
                            departmentLabel: 'Computer Science, Cybersecurity & Electrical Engineering',
                            workspaceKind: 'combined-programs',
                            workspaceSummary: 'Shared multi-program workspace',
                            memberProgramIds: ['computer-science', 'cybersecurity'],
                            baseProfileId: 'design-v1'
                        },
                        {
                            id: 'computer-science',
                            label: 'Computer Science',
                            suggestedCode: 'CSCD',
                            departmentId: 'csee',
                            departmentLabel: 'Computer Science, Cybersecurity & Electrical Engineering',
                            workspaceKind: 'program',
                            workspaceSummary: 'Program workspace',
                            baseProfileId: 'design-v1'
                        },
                        {
                            id: 'cybersecurity',
                            label: 'Cybersecurity',
                            suggestedCode: 'CYBR',
                            departmentId: 'csee',
                            departmentLabel: 'Computer Science, Cybersecurity & Electrical Engineering',
                            workspaceKind: 'program',
                            workspaceSummary: 'Program workspace',
                            baseProfileId: 'design-v1'
                        },
                        {
                            id: 'electrical-engineering',
                            label: 'Electrical Engineering',
                            suggestedCode: 'EE',
                            departmentId: 'csee',
                            departmentLabel: 'Computer Science, Cybersecurity & Electrical Engineering',
                            workspaceKind: 'program',
                            workspaceSummary: 'Program workspace',
                            baseProfileId: 'design-v1'
                        }
                    ]
                },
                {
                    type: 'program',
                    id: 'design',
                    label: 'Design',
                    suggestedCode: 'DESN',
                    baseProfileId: 'design-v1',
                    profileId: 'design-v1',
                    seededDefault: true
                },
                {
                    type: 'section',
                    title: 'Education',
                    items: [
                        {
                            id: 'science-education',
                            label: 'Science Education',
                            suggestedCode: 'SCED',
                            parentLabel: 'Education',
                            baseProfileId: 'design-v1'
                        },
                        {
                            id: 'mathematics-education',
                            label: 'Mathematics Education',
                            suggestedCode: 'MAED',
                            parentLabel: 'Education',
                            baseProfileId: 'design-v1'
                        }
                    ]
                },
                {
                    type: 'program',
                    id: 'environmental-science',
                    label: 'Environmental Science',
                    suggestedCode: 'ENVS',
                    baseProfileId: 'design-v1'
                },
                {
                    type: 'program',
                    id: 'geosciences',
                    label: 'Geosciences',
                    suggestedCode: 'GEOS',
                    baseProfileId: 'design-v1'
                },
                {
                    type: 'program',
                    id: 'mathematics',
                    label: 'Mathematics',
                    suggestedCode: 'MATH',
                    baseProfileId: 'design-v1'
                },
                {
                    type: 'program',
                    id: 'mechanical-engineering-technology',
                    label: 'Mechanical Engineering & Technology',
                    suggestedCode: 'MET',
                    baseProfileId: 'design-v1'
                },
                {
                    type: 'program',
                    id: 'physics',
                    label: 'Physics',
                    suggestedCode: 'PHYS',
                    baseProfileId: 'design-v1'
                }
            ]
        }
    ]);

    function safeLocalStorage() {
        try {
            return global.localStorage || null;
        } catch (error) {
            return null;
        }
    }

    function readJsonStorage(key) {
        const storage = safeLocalStorage();
        if (!storage) return null;
        try {
            const raw = storage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return null;
        }
    }

    function writeJsonStorage(key, value) {
        const storage = safeLocalStorage();
        if (!storage) return;
        try {
            storage.setItem(key, JSON.stringify(value));
        } catch (error) {
            // Ignore storage failures in the shell; the runtime can still proceed.
        }
    }

    function clearStorageKey(key) {
        const storage = safeLocalStorage();
        if (!storage) return;
        try {
            storage.removeItem(key);
        } catch (error) {
            // Ignore storage failures.
        }
    }

    function flattenPrograms(groups = DEFAULT_PROGRAM_GROUPS) {
        return (Array.isArray(groups) ? groups : []).flatMap((group) => {
            const entries = Array.isArray(group?.entries) ? group.entries : [];
            return entries.flatMap((entry) => {
                if (!entry || typeof entry !== 'object') return [];
                if (entry.type === 'section') {
                    return (Array.isArray(entry.items) ? entry.items : []).map((item) => ({
                        ...item,
                        parentLabel: String(item?.parentLabel || entry.title || '').trim() || null
                    }));
                }
                if (entry.type === 'department') {
                    return (Array.isArray(entry.items) ? entry.items : []).map((item) => ({
                        ...item,
                        parentLabel: String(item?.parentLabel || entry.title || '').trim() || null,
                        departmentId: String(item?.departmentId || sanitizeDepartmentId(entry.title || entry.id || '')).trim() || null,
                        departmentLabel: String(item?.departmentLabel || entry.title || '').trim() || null
                    }));
                }
                return [entry];
            });
        });
    }

    function findProgramById(programId, groups = DEFAULT_PROGRAM_GROUPS) {
        const normalizedId = String(programId || '').trim();
        if (!normalizedId) return null;
        return flattenPrograms(groups).find((program) => String(program.id) === normalizedId) || null;
    }

    function buildSuggestedIdentity(program) {
        const label = String(program?.identityName || program?.label || '').trim();
        const suggestedCode = String(program?.suggestedCode || '').trim().toUpperCase();
        return {
            name: label,
            code: suggestedCode,
            displayName: String(program?.identityDisplayName || (label ? `EWU ${label}` : '')).trim(),
            shortName: String(program?.identityShortName || program?.label || label).trim()
        };
    }

    function sanitizeDepartmentId(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+/, '')
            .replace(/-+$/, '');
    }

    function createProgramSelection(program) {
        if (!program || typeof program !== 'object') return null;
        return {
            id: String(program.id || '').trim(),
            label: String(program.label || '').trim(),
            parentLabel: String(program.parentLabel || '').trim() || null,
            departmentId: String(program.departmentId || '').trim() || null,
            departmentLabel: String(program.departmentLabel || '').trim() || null,
            profileId: String(program.profileId || '').trim() || null,
            baseProfileId: String(program.baseProfileId || program.profileId || 'design-v1').trim() || 'design-v1',
            suggestedCode: String(program.suggestedCode || '').trim() || null,
            workspaceKind: String(program.workspaceKind || 'program').trim() || 'program',
            workspaceSummary: String(program.workspaceSummary || '').trim() || null,
            memberProgramIds: Array.isArray(program.memberProgramIds)
                ? program.memberProgramIds.map((id) => String(id || '').trim()).filter(Boolean)
                : [],
            identityName: String(program.identityName || '').trim() || null,
            identityShortName: String(program.identityShortName || '').trim() || null,
            identityDisplayName: String(program.identityDisplayName || '').trim() || null,
            seededDefault: Boolean(program.seededDefault),
            selectedAt: new Date().toISOString()
        };
    }

    const TERM_LABELS = Object.freeze({
        fall: 'Fall',
        winter: 'Winter',
        spring: 'Spring',
        summer: 'Summer'
    });

    const TERM_SORT_ORDER = Object.freeze({
        fall: 0,
        winter: 1,
        spring: 2,
        summer: 3,
        unassigned: 99
    });

    function createArtifactMetadata(artifact) {
        if (!artifact || typeof artifact !== 'object') return null;
        return {
            name: String(artifact.name || '').trim() || null,
            size: Number(artifact.size) || 0,
            type: String(artifact.type || '').trim() || null,
            capturedAt: artifact.capturedAt || new Date().toISOString()
        };
    }

    function isScreenshotFile(file) {
        if (!file || typeof file !== 'object') return false;
        const name = String(file.name || '').trim().toLowerCase();
        const type = String(file.type || '').trim().toLowerCase();
        if (type.startsWith('image/')) return true;
        return /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);
    }

    function inferScreenshotTermYear(value) {
        const normalized = String(value || '').trim();
        if (!normalized) return { term: null, year: null };

        const byTermFirst = normalized.match(/\b(fall|winter|spring|summer)\b[^0-9]{0,12}(20\d{2})\b/i);
        if (byTermFirst) {
            return {
                term: String(byTermFirst[1] || '').trim().toLowerCase() || null,
                year: Number(byTermFirst[2]) || null
            };
        }

        const byYearFirst = normalized.match(/\b(20\d{2})\b[^a-z0-9]{0,12}(fall|winter|spring|summer)\b/i);
        if (byYearFirst) {
            return {
                term: String(byYearFirst[2] || '').trim().toLowerCase() || null,
                year: Number(byYearFirst[1]) || null
            };
        }

        return { term: null, year: null };
    }

    function formatScreenshotGroupLabel(term, year) {
        if (!term || !year) return 'Unassigned';
        return `${TERM_LABELS[term] || term} ${year}`;
    }

    function buildScreenshotArtifactBatch(files, options = {}) {
        const normalizedFiles = Array.from(files || [])
            .filter((file) => file && typeof file === 'object' && isScreenshotFile(file))
            .map((file, index) => {
                const artifact = createArtifactMetadata(file) || {};
                const relativePath = String(file.webkitRelativePath || file.relativePath || '').trim() || null;
                const sourcePath = relativePath || artifact.name || `screenshot-${index + 1}`;
                const inference = inferScreenshotTermYear(sourcePath);
                const groupKey = inference.term && inference.year
                    ? `${inference.term}-${inference.year}`
                    : 'unassigned';

                return {
                    name: artifact.name || `screenshot-${index + 1}`,
                    size: artifact.size || 0,
                    type: artifact.type || null,
                    relativePath,
                    sourcePath,
                    term: inference.term,
                    year: inference.year,
                    groupKey
                };
            });

        const groupsMap = new Map();
        normalizedFiles.forEach((file) => {
            if (!groupsMap.has(file.groupKey)) {
                groupsMap.set(file.groupKey, {
                    key: file.groupKey,
                    term: file.term,
                    year: file.year,
                    label: formatScreenshotGroupLabel(file.term, file.year),
                    fileCount: 0,
                    sampleNames: []
                });
            }

            const group = groupsMap.get(file.groupKey);
            group.fileCount += 1;
            if (group.sampleNames.length < 4) {
                group.sampleNames.push(file.relativePath || file.name);
            }
        });

        const rootFolderName = String(options.rootFolderName || '').trim() || (() => {
            const firstRelativePath = normalizedFiles.find((file) => file.relativePath)?.relativePath || '';
            return firstRelativePath ? firstRelativePath.split('/')[0] : null;
        })();

        const groups = Array.from(groupsMap.values()).sort((left, right) => {
            const leftYear = Number(left.year) || Number.MAX_SAFE_INTEGER;
            const rightYear = Number(right.year) || Number.MAX_SAFE_INTEGER;
            if (leftYear !== rightYear) return leftYear - rightYear;

            const leftOrder = TERM_SORT_ORDER[left.term || 'unassigned'] ?? TERM_SORT_ORDER.unassigned;
            const rightOrder = TERM_SORT_ORDER[right.term || 'unassigned'] ?? TERM_SORT_ORDER.unassigned;
            if (leftOrder !== rightOrder) return leftOrder - rightOrder;

            return String(left.label || '').localeCompare(String(right.label || ''));
        });

        return {
            mode: String(options.mode || 'files').trim() || 'files',
            rootFolderName: rootFolderName || null,
            count: normalizedFiles.length,
            totalSize: normalizedFiles.reduce((sum, file) => sum + (Number(file.size) || 0), 0),
            groups,
            files: normalizedFiles,
            capturedAt: options.capturedAt || new Date().toISOString()
        };
    }

    function resolveStoredSelection(groups = DEFAULT_PROGRAM_GROUPS) {
        const storedSelection = readSelection();
        const resolvedProgram = findProgramById(storedSelection?.id, groups);
        if (!resolvedProgram) return null;

        return {
            ...resolvedProgram,
            profileId: String(storedSelection?.profileId || resolvedProgram.profileId || '').trim() || null,
            baseProfileId: String(storedSelection?.baseProfileId || resolvedProgram.baseProfileId || resolvedProgram.profileId || 'design-v1').trim() || 'design-v1',
            seededDefault: storedSelection?.seededDefault == null
                ? Boolean(resolvedProgram.seededDefault)
                : Boolean(storedSelection.seededDefault)
        };
    }

    function readSelection() {
        return readJsonStorage(SHELL_SELECTION_STORAGE_KEY);
    }

    function persistSelection(selection) {
        writeJsonStorage(SHELL_SELECTION_STORAGE_KEY, selection);
    }

    function createOnboardingContext(program, options = {}) {
        const selection = createProgramSelection(program);
        const artifact = createArtifactMetadata(options.artifact);
        const artifactBatch = options.artifactBatch && typeof options.artifactBatch === 'object'
            ? buildScreenshotArtifactBatch(options.artifactBatch.files || [], options.artifactBatch)
            : null;
        const spreadsheetImport = options.spreadsheetImport && typeof options.spreadsheetImport === 'object'
            ? JSON.parse(JSON.stringify(options.spreadsheetImport))
            : null;

        return {
            ...(selection || {}),
            source: String(options.source || 'manual').trim() || 'manual',
            suggestedIdentity: buildSuggestedIdentity(program),
            artifact,
            artifactBatch,
            spreadsheetImport,
            createdAt: new Date().toISOString()
        };
    }

    function persistOnboardingContext(context) {
        writeJsonStorage(ONBOARDING_CONTEXT_STORAGE_KEY, context);
    }

    function readOnboardingContext() {
        return readJsonStorage(ONBOARDING_CONTEXT_STORAGE_KEY);
    }

    function clearOnboardingContext() {
        clearStorageKey(ONBOARDING_CONTEXT_STORAGE_KEY);
    }

    function isLocalPreviewHost() {
        const hostname = String(global.location?.hostname || '').trim().toLowerCase();
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    }

    function formatProgramLabel(program) {
        if (!program) return 'No program selected';
        const label = String(program.label || '').trim();
        const parentLabel = String(program.parentLabel || '').trim();
        return parentLabel ? `${parentLabel} / ${label}` : label;
    }

    function normalizeProgramMatchValue(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '');
    }

    async function findExistingProgramProfile(program, options = {}) {
        const manager = options.profileManager || global.DepartmentProfileManager || null;
        if (!program || !manager || typeof manager.listProfiles !== 'function' || typeof manager.loadProfile !== 'function') {
            return null;
        }

        try {
            const targetProgramId = normalizeProgramMatchValue(program.id);
            const targetCode = normalizeProgramMatchValue(program.suggestedCode);
            const targetLabel = normalizeProgramMatchValue(program.label);
            const storedActiveProfileId = typeof manager.getStoredProfileId === 'function'
                ? String(manager.getStoredProfileId() || '').trim()
                : '';

            async function loadCandidate(profileId, source) {
                if (!profileId) return null;
                const loaded = await manager.loadProfile(profileId);
                const profile = loaded?.profile;
                if (!profile || typeof profile !== 'object') return null;

                const onboardingMeta = profile.onboardingMeta && typeof profile.onboardingMeta === 'object'
                    ? profile.onboardingMeta
                    : {};
                const identity = profile.identity && typeof profile.identity === 'object'
                    ? profile.identity
                    : {};

                const catalogProgramId = normalizeProgramMatchValue(onboardingMeta.catalogProgramId);
                if (catalogProgramId && catalogProgramId === targetProgramId) {
                    return {
                        profileId,
                        profile,
                        source
                    };
                }

                const identityCode = normalizeProgramMatchValue(identity.code);
                const identityName = normalizeProgramMatchValue(identity.name);
                const identityShortName = normalizeProgramMatchValue(identity.shortName);
                const catalogProgramLabel = normalizeProgramMatchValue(onboardingMeta.catalogProgramLabel);

                if (
                    (targetCode && identityCode === targetCode) ||
                    (targetLabel && (
                        catalogProgramLabel === targetLabel ||
                        identityName === targetLabel ||
                        identityShortName === targetLabel
                    ))
                ) {
                    return {
                        profileId,
                        profile,
                        source: `${source}-fallback`
                    };
                }

                return null;
            }

            if (storedActiveProfileId) {
                const activeMatch = await loadCandidate(storedActiveProfileId, 'active-profile');
                if (activeMatch) return activeMatch;
            }

            const listing = await manager.listProfiles();
            const profiles = Array.isArray(listing?.profiles) ? listing.profiles : [];
            const candidates = profiles
                .filter((entry) => entry && entry.id && entry.source === 'custom-local')
                .sort((left, right) => String(right?.savedAt || '').localeCompare(String(left?.savedAt || '')));

            let fallbackMatch = null;
            for (const entry of candidates) {
                const candidateMatch = await loadCandidate(entry.id, 'custom-profile');
                if (!candidateMatch) continue;
                if (candidateMatch.source === 'custom-profile') {
                    return candidateMatch;
                }
                if (!fallbackMatch) {
                    fallbackMatch = candidateMatch;
                }
            }

            return fallbackMatch;
        } catch (error) {
            return null;
        }
    }

    async function detectProgramData(program, options = {}) {
        if (!program || typeof program !== 'object') {
            return { hasData: false, source: 'none' };
        }

        if (program.seededDefault) {
            return { hasData: true, source: 'embedded-runtime' };
        }

        const manager = options.profileManager || global.DepartmentProfileManager || null;
        const getClient = options.getSupabaseClient || global.getSupabaseClient || null;
        const isConfigured = options.isSupabaseConfigured || global.isSupabaseConfigured || null;

        const existingProfileMatch = await findExistingProgramProfile(program, { profileManager: manager });
        if (existingProfileMatch?.profileId) {
            return {
                hasData: true,
                source: existingProfileMatch.source || 'custom-profile',
                profileId: existingProfileMatch.profileId
            };
        }

        if (program.profileId && manager && typeof manager.loadProfile === 'function') {
            try {
                const loaded = await manager.loadProfile(program.profileId);
                const prefix = String(loaded?.profile?.scheduler?.storageKeyPrefix || '').trim();
                if (prefix) {
                    const storage = safeLocalStorage();
                    const hasLocalData = storage
                        ? Object.keys(storage).some((key) => key.startsWith(prefix))
                        : false;
                    if (hasLocalData) {
                        return { hasData: true, source: 'local-storage', profileId: program.profileId };
                    }
                }
            } catch (error) {
                // Keep probing with other sources.
            }
        }

        if (typeof isConfigured === 'function' && isConfigured() && typeof getClient === 'function') {
            try {
                const client = getClient();
                if (client && typeof client.from === 'function' && program.suggestedCode) {
                    const { data: department } = await client
                        .from('departments')
                        .select('id')
                        .eq('code', String(program.suggestedCode).trim().toUpperCase())
                        .maybeSingle();

                    if (department?.id) {
                        const [scheduledCoursesResult, courseResult, facultyResult] = await Promise.all([
                            client.from('scheduled_courses').select('id', { count: 'exact', head: true }).eq('department_id', department.id),
                            client.from('courses').select('id', { count: 'exact', head: true }).eq('department_id', department.id),
                            client.from('faculty').select('id', { count: 'exact', head: true }).eq('department_id', department.id)
                        ]);

                        const counts = [
                            Number(scheduledCoursesResult?.count) || 0,
                            Number(courseResult?.count) || 0,
                            Number(facultyResult?.count) || 0
                        ];

                        if (counts.some((count) => count > 0)) {
                            return { hasData: true, source: 'supabase', profileId: program.profileId || null };
                        }
                    }
                }
            } catch (error) {
                // Ignore Supabase probe failures and fall back to the configured defaults.
            }
        }

        return { hasData: false, source: 'none' };
    }

    function bootstrap(options = {}) {
        if (!global.document) {
            return Promise.resolve(false);
        }

        const launchRuntime = typeof options.launchRuntime === 'function' ? options.launchRuntime : null;
        if (!launchRuntime) {
            throw new Error('Program shell bootstrap requires a launchRuntime function.');
        }

        const overlay = global.document.getElementById('programShellOverlay');
        if (!overlay) {
            return launchRuntime();
        }

        const authService = options.authService || global.AuthService || null;
        const manager = options.profileManager || global.DepartmentProfileManager || null;
        const onboardingUrl = String(options.onboardingUrl || 'pages/department-onboarding.html').trim() || 'pages/department-onboarding.html';
        const groups = Array.isArray(options.programGroups) ? options.programGroups : DEFAULT_PROGRAM_GROUPS;
        const importApi = global.ProgramCommandImport || null;
        const pendingOnboardingImport = importApi && typeof importApi.readPendingOnboardingImport === 'function'
            ? importApi.readPendingOnboardingImport()
            : null;
        const pendingProgram = findProgramById(pendingOnboardingImport?.programId, groups);

        const elements = {
            overlay,
            programList: global.document.getElementById('programShellProgramList'),
            summary: global.document.getElementById('programShellSummary'),
            authForm: global.document.getElementById('programShellAuthForm'),
            email: global.document.getElementById('programShellEmail'),
            password: global.document.getElementById('programShellPassword'),
            sessionPanel: global.document.getElementById('programShellSessionPanel'),
            sessionText: global.document.getElementById('programShellSessionText'),
            previewButton: global.document.getElementById('programShellPreviewButton'),
            switchAccountButton: global.document.getElementById('programShellSwitchAccountButton'),
            continueButton: global.document.getElementById('programShellContinueButton'),
            backButton: global.document.getElementById('programShellBackButton'),
            chooser: global.document.getElementById('programShellChooser'),
            manualButton: global.document.getElementById('programShellManualButton'),
            spreadsheetButton: global.document.getElementById('programShellSpreadsheetButton'),
            screenshotDirectoryButton: global.document.getElementById('programShellScreenshotDirectoryButton'),
            screenshotButton: global.document.getElementById('programShellScreenshotButton'),
            spreadsheetInput: global.document.getElementById('programShellSpreadsheetInput'),
            screenshotDirectoryInput: global.document.getElementById('programShellScreenshotDirectoryInput'),
            screenshotInput: global.document.getElementById('programShellScreenshotInput'),
            screenshotSupportText: global.document.getElementById('programShellScreenshotSupportText'),
            chooserMeta: global.document.getElementById('programShellChooserMeta'),
            status: global.document.getElementById('programShellStatus')
        };

        const state = {
            selectedProgram: pendingProgram || resolveStoredSelection(groups),
            session: null,
            previewMode: false,
            chooserVisible: false,
            runtimeLaunched: false,
            pendingOnboardingImport,
            directoryUploadSupported: Boolean(elements.screenshotDirectoryInput && ('webkitdirectory' in elements.screenshotDirectoryInput))
        };

        if (pendingProgram && pendingOnboardingImport?.profileId) {
            persistSelection(createProgramSelection({
                ...pendingProgram,
                profileId: String(pendingOnboardingImport.profileId || '').trim() || null
            }));
        }

        function authSatisfied() {
            return Boolean(state.session || state.previewMode);
        }

        function setStatus(kind, message) {
            if (!elements.status) return;
            elements.status.className = `program-shell-status ${kind}`;
            elements.status.textContent = message;
        }

        function persistSelectedProgram(program, overrides = {}) {
            if (!program || typeof program !== 'object') return;
            state.selectedProgram = {
                ...program,
                ...overrides
            };
            persistSelection(createProgramSelection(state.selectedProgram));
        }

        function resetChooserDetails() {
            state.chooserVisible = false;
            if (elements.chooserMeta) {
                elements.chooserMeta.textContent = '';
            }
        }

        function renderProgramList() {
            if (!elements.programList) return;
            elements.programList.innerHTML = '';

            groups.forEach((group) => {
                const card = global.document.createElement('section');
                card.className = 'program-shell-catalog';

                const heading = global.document.createElement('div');
                heading.className = 'program-shell-catalog-heading';
                heading.textContent = String(group?.title || '').trim() || 'Programs';
                card.appendChild(heading);

                const entryWrap = global.document.createElement('div');
                entryWrap.className = 'program-shell-catalog-list';

                const entries = Array.isArray(group?.entries) ? group.entries : [];
                entries.forEach((entry) => {
                    if (!entry || typeof entry !== 'object') return;
                    if (entry.type === 'section') {
                        const section = global.document.createElement('div');
                        section.className = 'program-shell-subsection';

                        const sectionTitle = global.document.createElement('div');
                        sectionTitle.className = 'program-shell-subsection-title';
                        sectionTitle.textContent = String(entry.title || '').trim() || 'Programs';
                        section.appendChild(sectionTitle);

                        const sectionList = global.document.createElement('div');
                        sectionList.className = 'program-shell-subsection-list';

                        (Array.isArray(entry.items) ? entry.items : []).forEach((item) => {
                            const itemButton = buildProgramButton({
                                ...item,
                                parentLabel: String(item?.parentLabel || entry.title || '').trim() || null
                            });
                            sectionList.appendChild(itemButton);
                        });

                        section.appendChild(sectionList);
                        entryWrap.appendChild(section);
                        return;
                    }
                    if (entry.type === 'department') {
                        const section = global.document.createElement('div');
                        section.className = 'program-shell-subsection';

                        const sectionTitle = global.document.createElement('div');
                        sectionTitle.className = 'program-shell-subsection-title';
                        sectionTitle.textContent = String(entry.title || '').trim() || 'Department';
                        section.appendChild(sectionTitle);

                        const sectionList = global.document.createElement('div');
                        sectionList.className = 'program-shell-subsection-list';

                        (Array.isArray(entry.items) ? entry.items : []).forEach((item) => {
                            const itemButton = buildProgramButton({
                                ...item,
                                parentLabel: String(item?.parentLabel || entry.title || '').trim() || null,
                                departmentId: String(item?.departmentId || sanitizeDepartmentId(entry.title || entry.id || '')).trim() || null,
                                departmentLabel: String(item?.departmentLabel || entry.title || '').trim() || null
                            });
                            sectionList.appendChild(itemButton);
                        });

                        section.appendChild(sectionList);
                        entryWrap.appendChild(section);
                        return;
                    }

                    entryWrap.appendChild(buildProgramButton(entry));
                });

                card.appendChild(entryWrap);
                elements.programList.appendChild(card);
            });
        }

        function buildProgramButton(program) {
            const button = global.document.createElement('button');
            button.type = 'button';
            button.className = 'program-shell-program-button';
            button.dataset.programId = String(program.id || '');
            button.setAttribute('aria-pressed', state.selectedProgram?.id === program.id ? 'true' : 'false');

            if (state.selectedProgram?.id === program.id) {
                button.classList.add('selected');
            }

            const label = global.document.createElement('span');
            label.className = 'program-shell-program-label';
            label.textContent = String(program.label || '').trim();
            button.appendChild(label);

            const meta = global.document.createElement('span');
            meta.className = 'program-shell-program-meta';
            meta.textContent = program.seededDefault
                ? 'Seeded workspace available'
                : String(program.workspaceSummary || '').trim() || 'Start with onboarding';
            button.appendChild(meta);

            button.addEventListener('click', () => {
                persistSelectedProgram(program, { profileId: String(program.profileId || '').trim() || null });
                state.previewMode = false;
                resetChooserDetails();
                setStatus('info', `${formatProgramLabel(program)} selected. Authenticate to continue.`);
                updateUi();
                if (elements.email) {
                    elements.email.focus();
                }
            });

            return button;
        }

        function updateUi() {
            renderProgramList();

            if (elements.summary) {
                elements.summary.textContent = state.selectedProgram
                    ? `${formatProgramLabel(state.selectedProgram)} selected.`
                    : 'Choose a program to unlock the correct entry path.';
            }

            const showSessionPanel = authSatisfied();
            if (elements.authForm) {
                elements.authForm.hidden = showSessionPanel;
            }
            if (elements.sessionPanel) {
                elements.sessionPanel.hidden = !showSessionPanel;
            }
            if (elements.sessionText) {
                if (state.previewMode) {
                    elements.sessionText.textContent = 'Local preview session active.';
                } else if (state.session?.user?.email) {
                    elements.sessionText.textContent = `Signed in as ${state.session.user.email}.`;
                } else {
                    elements.sessionText.textContent = 'Authentication complete.';
                }
            }

            if (elements.previewButton) {
                elements.previewButton.hidden = !isLocalPreviewHost() || authSatisfied();
            }

            if (elements.continueButton) {
                elements.continueButton.disabled = !state.selectedProgram || !authSatisfied();
            }

            if (elements.screenshotDirectoryButton) {
                elements.screenshotDirectoryButton.hidden = !state.directoryUploadSupported;
            }
            if (elements.screenshotSupportText) {
                elements.screenshotSupportText.textContent = state.directoryUploadSupported
                    ? 'Folder upload keeps nested quarter folders when the browser supports directory selection.'
                    : 'This browser does not expose directory selection here, so use multiple screenshot files instead.';
            }
            if (elements.screenshotButton) {
                elements.screenshotButton.textContent = state.directoryUploadSupported
                    ? 'Choose screenshot files'
                    : 'Choose screenshots';
            }

            if (elements.chooser) {
                elements.chooser.hidden = !state.chooserVisible || !authSatisfied();
            }
            if (elements.backButton) {
                elements.backButton.hidden = !state.chooserVisible || !authSatisfied();
            }
        }

        async function refreshSessionFromAuth() {
            if (!authService || typeof authService.getSession !== 'function') {
                state.session = null;
                updateUi();
                return;
            }
            try {
                state.session = await authService.getSession();
            } catch (error) {
                state.session = null;
            }
            updateUi();
        }

        async function handleCredentialSubmit(mode) {
            if (!authService) {
                setStatus('error', 'Authentication service is unavailable.');
                return;
            }

            const email = String(elements.email?.value || '').trim();
            const password = String(elements.password?.value || '');
            if (!email || !password) {
                setStatus('error', 'Enter an email and password to continue.');
                return;
            }

            try {
                if (mode === 'create') {
                    const result = await authService.signUp(email, password, 'chair');
                    if (!result?.session) {
                        setStatus('warn', 'Account created. Check your email confirmation, then sign in to continue.');
                        updateUi();
                        return;
                    }
                } else {
                    await authService.signIn(email, password);
                }

                state.previewMode = false;
                await refreshSessionFromAuth();
                setStatus('ok', 'Authentication complete. Continue into Program Command.');
            } catch (error) {
                const message = error?.message || 'Authentication failed.';
                setStatus('error', message);
            }
        }

        function activatePreviewMode() {
            state.previewMode = true;
            state.session = null;
            setStatus('warn', 'Local preview session enabled on localhost. Production still requires a real account.');
            updateUi();
        }

        async function handleContinue() {
            if (!state.selectedProgram) {
                setStatus('error', 'Choose a program before continuing.');
                return;
            }
            if (!authSatisfied()) {
                setStatus('error', 'Authenticate before entering a program workspace.');
                return;
            }

            setStatus('info', `Checking ${formatProgramLabel(state.selectedProgram)} for existing program data...`);
            const dataState = await detectProgramData(state.selectedProgram, {
                profileManager: manager
            });

            if (dataState.hasData) {
                const nextProfileId = String(dataState.profileId || state.selectedProgram.profileId || '').trim();
                if (nextProfileId) {
                    persistSelectedProgram(state.selectedProgram, { profileId: nextProfileId });
                }
                if (manager && typeof manager.setActiveProfile === 'function' && nextProfileId) {
                    try {
                        await manager.setActiveProfile(nextProfileId);
                    } catch (error) {
                        setStatus('error', error?.message || 'Could not activate the selected profile.');
                        return;
                    }
                }

                clearOnboardingContext();
                state.chooserVisible = false;
                updateUi();
                setStatus('ok', `Opening ${formatProgramLabel(state.selectedProgram)} in Program Command...`);

                if (!state.runtimeLaunched) {
                    state.runtimeLaunched = true;
                    overlay.hidden = true;
                    await launchRuntime();
                }
                return;
            }

            state.chooserVisible = true;
            if (elements.chooserMeta) {
                elements.chooserMeta.textContent = `${formatProgramLabel(state.selectedProgram)} does not have seeded data yet. Start with manual setup or capture the import artifacts to continue into onboarding and CLSS review.`;
            }
            setStatus('info', `${formatProgramLabel(state.selectedProgram)} is empty. Choose how you want to start onboarding.`);
            updateUi();
        }

        async function maybeResumePendingOnboardingImport() {
            if (!state.pendingOnboardingImport || state.runtimeLaunched) {
                return false;
            }

            const resumedProgram = findProgramById(state.pendingOnboardingImport.programId, groups);
            if (!resumedProgram) {
                return false;
            }

            persistSelectedProgram(resumedProgram, {
                profileId: String(state.pendingOnboardingImport.profileId || resumedProgram.profileId || '').trim() || null
            });

            if (!authSatisfied()) {
                if (isLocalPreviewHost()) {
                    activatePreviewMode();
                } else {
                    setStatus('info', `${formatProgramLabel(resumedProgram)} is ready. Sign in to resume the pending import handoff.`);
                    return false;
                }
            }

            setStatus('info', `Resuming ${formatProgramLabel(resumedProgram)} import handoff...`);
            await handleContinue();
            return true;
        }

        function navigateToOnboarding(source, intake = {}) {
            if (!state.selectedProgram) {
                setStatus('error', 'Choose a program before starting onboarding.');
                return;
            }
            if (!authSatisfied()) {
                setStatus('error', 'Authenticate before entering onboarding.');
                return;
            }
            if (!state.chooserVisible) {
                setStatus('error', 'Continue into the selected program before choosing an onboarding path.');
                return;
            }

            const context = createOnboardingContext(state.selectedProgram, {
                source,
                artifact: intake.artifact || null,
                artifactBatch: intake.artifactBatch || null,
                spreadsheetImport: intake.spreadsheetImport || null
            });
            persistOnboardingContext(context);
            global.location.href = `${onboardingUrl}?source=${encodeURIComponent(source)}&program=${encodeURIComponent(context.id || '')}`;
        }

        function handleScreenshotSelection(files, mode) {
            const artifactBatch = buildScreenshotArtifactBatch(files, {
                mode
            });

            if (!artifactBatch.count) {
                setStatus('error', 'Choose one or more screenshot files to continue.');
                return;
            }

            navigateToOnboarding('screenshot', { artifactBatch });
        }

        renderProgramList();

        elements.authForm?.addEventListener('submit', (event) => {
            event.preventDefault();
            handleCredentialSubmit('signin');
        });

        global.document.getElementById('programShellCreateAccountButton')?.addEventListener('click', () => {
            handleCredentialSubmit('create');
        });

        elements.previewButton?.addEventListener('click', activatePreviewMode);
        elements.switchAccountButton?.addEventListener('click', async () => {
            state.previewMode = false;
            try {
                await authService?.signOut?.();
            } catch (error) {
                // Ignore sign-out failures during shell switching.
            }
            state.session = null;
            elements.password.value = '';
            setStatus('info', 'Signed out. Choose another account to continue.');
            updateUi();
        });
        elements.continueButton?.addEventListener('click', handleContinue);
        elements.backButton?.addEventListener('click', () => {
            resetChooserDetails();
            setStatus('info', 'Choose a different program or continue into onboarding when ready.');
            updateUi();
        });
        elements.manualButton?.addEventListener('click', () => {
            navigateToOnboarding('manual', null);
        });
        elements.spreadsheetButton?.addEventListener('click', () => {
            elements.spreadsheetInput?.click();
        });
        elements.screenshotDirectoryButton?.addEventListener('click', () => {
            elements.screenshotDirectoryInput?.click();
        });
        elements.screenshotButton?.addEventListener('click', () => {
            elements.screenshotInput?.click();
        });
        elements.spreadsheetInput?.addEventListener('change', (event) => {
            const file = event.target?.files?.[0];
            if (!file) return;
            const artifact = {
                name: file.name,
                size: file.size,
                type: file.type,
                capturedAt: new Date().toISOString()
            };

            const importApi = global.ProgramCommandImport;
            if (!importApi || typeof importApi.readTabularRowsFromFile !== 'function') {
                setStatus('error', 'Spreadsheet import runtime is unavailable on this page.');
                event.target.value = '';
                return;
            }

            setStatus('info', `Parsing ${file.name} before onboarding...`);
            importApi.readTabularRowsFromFile(file)
                .then((spreadsheetImport) => {
                    if (!spreadsheetImport?.rows?.length) {
                        const warning = Array.isArray(spreadsheetImport?.meta?.warnings) && spreadsheetImport.meta.warnings.length
                            ? spreadsheetImport.meta.warnings[0]
                            : 'Spreadsheet did not contain any importable rows.';
                        setStatus('error', warning);
                        return;
                    }

                    navigateToOnboarding('spreadsheet', {
                        artifact,
                        spreadsheetImport
                    });
                })
                .catch((error) => {
                    setStatus('error', error?.message || 'Could not parse the selected spreadsheet.');
                })
                .finally(() => {
                    event.target.value = '';
                });
        });
        elements.screenshotDirectoryInput?.addEventListener('change', (event) => {
            const files = Array.from(event.target?.files || []);
            if (!files.length) return;
            handleScreenshotSelection(files, 'directory');
        });
        elements.screenshotInput?.addEventListener('change', (event) => {
            const files = Array.from(event.target?.files || []);
            if (!files.length) return;
            handleScreenshotSelection(files, 'files');
        });

        if (authService && typeof authService.onAuthStateChange === 'function') {
            try {
                authService.onAuthStateChange(() => {
                    refreshSessionFromAuth().catch(() => {});
                });
            } catch (error) {
                // Ignore auth state subscription failures.
            }
        }

        overlay.hidden = false;
        setStatus('info', state.selectedProgram
            ? `${formatProgramLabel(state.selectedProgram)} selected. Authenticate to continue.`
            : 'Welcome to Program Command. Choose a program to begin.');

        return refreshSessionFromAuth().then(() => maybeResumePendingOnboardingImport());
    }

    const api = {
        SHELL_SELECTION_STORAGE_KEY,
        ONBOARDING_CONTEXT_STORAGE_KEY,
        DEFAULT_PROGRAM_GROUPS,
        flattenPrograms,
        findProgramById,
        buildSuggestedIdentity,
        createProgramSelection,
        buildScreenshotArtifactBatch,
        createOnboardingContext,
        detectProgramData,
        readSelection,
        persistSelection,
        readOnboardingContext,
        persistOnboardingContext,
        clearOnboardingContext,
        bootstrap
    };

    global.ProgramCommandShell = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
