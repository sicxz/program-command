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

    function cloneJson(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function sanitizeDepartmentId(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+/, '')
            .replace(/-+$/, '');
    }

    function buildStorageKeyPrefix(identity) {
        const base = sanitizeDepartmentId(identity?.code || identity?.shortName || identity?.name || 'department');
        return `${base}SchedulerData_`;
    }

    function getNextAcademicYearLabel(yearLabel) {
        const normalized = String(yearLabel || '').trim();
        const match = normalized.match(/^(\d{4})-(\d{2})$/);
        if (!match) return '';
        const startYear = Number(match[1]);
        if (!Number.isFinite(startYear)) return '';
        return `${startYear + 1}-${String(startYear + 2).slice(-2)}`;
    }

    function remapDepartmentCourseCodes(courseMap, nextCode, previousCode) {
        if (!courseMap || typeof courseMap !== 'object' || Array.isArray(courseMap)) {
            return courseMap;
        }

        const nextPrefix = String(nextCode || '').trim().toUpperCase();
        const previousPrefix = String(previousCode || '').trim().toUpperCase();
        if (!nextPrefix) return cloneJson(courseMap);

        return Object.entries(courseMap).reduce((result, [courseCode, details]) => {
            const normalizedCode = String(courseCode || '').trim();
            let nextCourseCode = normalizedCode;
            if (previousPrefix) {
                const previousPattern = new RegExp(`^${previousPrefix}(\\s+\\d)`, 'i');
                nextCourseCode = normalizedCode.replace(previousPattern, `${nextPrefix}$1`);
            }
            result[nextCourseCode] = cloneJson(details);
            return result;
        }, {});
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
        const screenshotImport = options.screenshotImport && typeof options.screenshotImport === 'object'
            ? JSON.parse(JSON.stringify(options.screenshotImport))
            : null;

        return {
            ...(selection || {}),
            source: String(options.source || 'manual').trim() || 'manual',
            suggestedIdentity: buildSuggestedIdentity(program),
            artifact,
            artifactBatch,
            spreadsheetImport,
            screenshotImport,
            createdAt: new Date().toISOString()
        };
    }

    function buildAutomaticProgramProfile(baseProfile, program, options = {}) {
        const draft = cloneJson(baseProfile && typeof baseProfile === 'object' ? baseProfile : {});
        const identity = buildSuggestedIdentity(program);
        const previousCode = String(draft.identity?.code || '').trim();

        draft.id = sanitizeDepartmentId(identity.code || identity.name || program?.id || 'program');
        draft.version = Number(draft.version) || 1;
        draft.identity = {
            ...draft.identity,
            name: String(identity.name || program?.label || draft.identity?.name || 'Program').trim(),
            code: String(identity.code || draft.identity?.code || '').trim().toUpperCase(),
            displayName: String(identity.displayName || draft.identity?.displayName || identity.name || program?.label || 'Program Command').trim(),
            shortName: String(identity.shortName || identity.name || program?.label || draft.identity?.shortName || 'Program').trim()
        };

        draft.branding = draft.branding || {};
        draft.branding.appTitle = `Program Command - ${draft.identity.displayName}`;
        draft.branding.headerEyebrow = `${String(draft.identity.displayName || '').trim().toUpperCase()} · PROGRAM COMMAND`;
        draft.branding.headerSubtitle = `${draft.identity.shortName} Program Planning and Schedule Operations`;

        draft.scheduler = draft.scheduler || {};
        draft.scheduler.storageKeyPrefix = buildStorageKeyPrefix(draft.identity);
        const allowedRooms = Array.isArray(draft.scheduler.allowedRooms)
            ? draft.scheduler.allowedRooms.map((room) => String(room || '').trim()).filter(Boolean)
            : [];
        draft.scheduler.allowedRooms = allowedRooms;
        const roomLabels = draft.scheduler.roomLabels && typeof draft.scheduler.roomLabels === 'object'
            ? draft.scheduler.roomLabels
            : {};
        const nextRoomLabels = {};
        allowedRooms.forEach((room) => {
            nextRoomLabels[room] = String(roomLabels[room] || room).trim() || room;
        });
        draft.scheduler.roomLabels = nextRoomLabels;

        draft.import = draft.import || {};
        draft.import.clss = draft.import.clss || {};
        if (!Array.isArray(draft.import.clss.roomMatchPriority) || !draft.import.clss.roomMatchPriority.length) {
            draft.import.clss.roomMatchPriority = allowedRooms.slice();
        }
        if (!draft.import.clss.facultyAliases || typeof draft.import.clss.facultyAliases !== 'object') {
            draft.import.clss.facultyAliases = {};
        }
        if (!draft.import.clss.courseAliases || typeof draft.import.clss.courseAliases !== 'object') {
            draft.import.clss.courseAliases = {};
        }

        draft.workload = draft.workload || {};
        draft.workload.dashboardTitle = String(draft.workload.dashboardTitle || 'Faculty Workload Dashboard').trim() || 'Faculty Workload Dashboard';
        draft.workload.dashboardSubtitleBase = `${draft.identity.displayName} Department - Academic Workload Analysis`;
        const resetYear = getNextAcademicYearLabel(draft.academic?.defaultSchedulerYear);
        if (resetYear) {
            draft.workload.productionResetDefaultScheduleYear = resetYear;
        }
        if (draft.workload.appliedLearningCourses && typeof draft.workload.appliedLearningCourses === 'object' && !Array.isArray(draft.workload.appliedLearningCourses)) {
            draft.workload.appliedLearningCourses = remapDepartmentCourseCodes(
                draft.workload.appliedLearningCourses,
                draft.identity.code,
                previousCode
            );
        }

        draft.onboardingMeta = {
            ...(draft.onboardingMeta && typeof draft.onboardingMeta === 'object' ? draft.onboardingMeta : {}),
            basedOn: String(options.baseProfileId || '').trim() || null,
            generatedAt: new Date().toISOString(),
            generatedBy: 'program-shell-direct-import-v1',
            catalogProgramId: String(program?.id || '').trim() || null,
            catalogProgramLabel: String(program?.label || '').trim() || null,
            catalogDepartmentId: String(program?.departmentId || '').trim() || null,
            catalogDepartmentLabel: String(program?.departmentLabel || '').trim() || null,
            catalogWorkspaceKind: String(program?.workspaceKind || 'program').trim() || 'program',
            catalogMemberProgramIds: Array.isArray(program?.memberProgramIds)
                ? program.memberProgramIds.map((id) => String(id || '').trim()).filter(Boolean)
                : [],
            previousCode: previousCode || null
        };

        return {
            profile: draft,
            baseId: sanitizeDepartmentId(draft.identity?.code || draft.identity?.name || program?.id || 'program')
        };
    }

    function createPendingImportPayload(source, program, profileId, intake = {}) {
        return {
            source: String(source || '').trim() || 'spreadsheet',
            programId: String(program?.id || '').trim() || null,
            label: String(program?.label || '').trim() || null,
            profileId: String(profileId || program?.profileId || '').trim() || null,
            artifact: intake.artifact || null,
            artifactBatch: intake.artifactBatch || null,
            spreadsheetImport: intake.spreadsheetImport || null,
            screenshotImport: intake.screenshotImport || null,
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

    function canImportIntoProgram(program) {
        return Boolean(program && String(program.workspaceKind || 'program').trim() === 'program');
    }

    function getImportRestrictionMessage(program) {
        const label = formatProgramLabel(program);
        return `${label} is a shared workspace. Import one program at a time, then use department or combined views to see programs together in the grid.`;
    }

    function profileMatchesProgram(profile, program) {
        if (!profile || typeof profile !== 'object' || !program || typeof program !== 'object') {
            return false;
        }

        const targetProgramId = normalizeProgramMatchValue(program.id);
        const targetCode = normalizeProgramMatchValue(program.suggestedCode);
        const targetLabel = normalizeProgramMatchValue(program.label);
        const onboardingMeta = profile.onboardingMeta && typeof profile.onboardingMeta === 'object'
            ? profile.onboardingMeta
            : {};
        const identity = profile.identity && typeof profile.identity === 'object'
            ? profile.identity
            : {};

        const catalogProgramId = normalizeProgramMatchValue(onboardingMeta.catalogProgramId);
        if (catalogProgramId && catalogProgramId === targetProgramId) {
            return true;
        }

        const identityCode = normalizeProgramMatchValue(identity.code);
        const identityName = normalizeProgramMatchValue(identity.name);
        const identityShortName = normalizeProgramMatchValue(identity.shortName);
        const catalogProgramLabel = normalizeProgramMatchValue(onboardingMeta.catalogProgramLabel);

        return Boolean(
            (targetCode && identityCode === targetCode)
            || (targetLabel && (
                catalogProgramLabel === targetLabel ||
                identityName === targetLabel ||
                identityShortName === targetLabel
            ))
        );
    }

    async function loadMatchingProfile(program, profileId, manager, source) {
        if (!profileId || !manager || typeof manager.loadProfile !== 'function') {
            return null;
        }

        const loaded = await manager.loadProfile(profileId);
        const profile = loaded?.profile;
        if (!profileMatchesProgram(profile, program)) {
            return null;
        }

        return {
            profileId,
            profile,
            source
        };
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
            const storedActiveProfileId = typeof manager.getStoredProfileId === 'function'
                ? String(manager.getStoredProfileId() || '').trim()
                : '';

            if (storedActiveProfileId) {
                const activeMatch = await loadMatchingProfile(program, storedActiveProfileId, manager, 'active-profile');
                if (activeMatch) return activeMatch;
            }

            const listing = await manager.listProfiles();
            const profiles = Array.isArray(listing?.profiles) ? listing.profiles : [];
            const candidates = profiles
                .filter((entry) => entry && entry.id && entry.source === 'custom-local')
                .sort((left, right) => String(right?.savedAt || '').localeCompare(String(left?.savedAt || '')));

            let fallbackMatch = null;
            for (const entry of candidates) {
                const candidateMatch = await loadMatchingProfile(program, entry.id, manager, 'custom-profile');
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

    async function ensureProgramProfile(program, options = {}) {
        if (!program || typeof program !== 'object') {
            throw new Error('Choose a program before starting import.');
        }
        if (!canImportIntoProgram(program)) {
            throw new Error(getImportRestrictionMessage(program));
        }

        const manager = options.profileManager || global.DepartmentProfileManager || null;
        if (!manager || typeof manager.loadProfile !== 'function' || typeof manager.saveCustomProfile !== 'function') {
            throw new Error('Department profile manager is unavailable for import setup.');
        }

        const existing = await findExistingProgramProfile(program, { profileManager: manager });
        if (existing?.profileId) {
            if (typeof manager.setActiveProfile === 'function') {
                await manager.setActiveProfile(existing.profileId);
            }
            return {
                profileId: existing.profileId,
                profile: existing.profile,
                source: existing.source || 'existing-profile'
            };
        }

        const baseProfileId = String(
            options.baseProfileId
            || program.baseProfileId
            || program.profileId
            || manager.getStoredProfileId?.()
            || 'design-v1'
        ).trim() || 'design-v1';
        const loadedBase = await manager.loadProfile(baseProfileId);
        const baseProfile = loadedBase?.profile || manager.getDefaultProfile?.();
        if (!baseProfile || typeof baseProfile !== 'object') {
            throw new Error(`Could not load base profile ${baseProfileId} for import setup.`);
        }

        const draft = buildAutomaticProgramProfile(baseProfile, program, { baseProfileId });
        const saved = await manager.saveCustomProfile(draft.profile, {
            baseId: draft.baseId,
            activate: true
        });

        return {
            profileId: saved.profileId,
            profile: saved.profile,
            source: 'auto-bootstrap'
        };
    }

    async function collectProgramWorkspaceDebug(program, options = {}) {
        const manager = options.profileManager || global.DepartmentProfileManager || null;
        const importApi = options.importApi || global.ProgramCommandImport || null;
        const storage = safeLocalStorage();
        const selection = readSelection();
        const pendingImport = importApi && typeof importApi.readPendingOnboardingImport === 'function'
            ? importApi.readPendingOnboardingImport()
            : null;
        const activeProfileId = manager && typeof manager.getStoredProfileId === 'function'
            ? String(manager.getStoredProfileId() || '').trim() || null
            : null;
        const existing = program
            ? await findExistingProgramProfile(program, { profileManager: manager })
            : null;

        return {
            timestamp: new Date().toISOString(),
            program: program ? createProgramSelection(program) : null,
            selection,
            activeProfileId,
            existingWorkspace: existing ? {
                profileId: existing.profileId,
                source: existing.source,
                storageKeyPrefix: String(existing.profile?.scheduler?.storageKeyPrefix || '').trim() || null
            } : null,
            pendingImport: pendingImport ? {
                source: pendingImport.source || null,
                programId: pendingImport.programId || null,
                profileId: pendingImport.profileId || null
            } : null,
            storageKeys: storage ? Object.keys(storage).filter((key) => /programCommand|SchedulerData_/.test(key)).sort() : []
        };
    }

    async function resetProgramWorkspace(program, options = {}) {
        if (!program || typeof program !== 'object') {
            throw new Error('Choose a program before resetting workspace state.');
        }
        if (!canImportIntoProgram(program)) {
            throw new Error(getImportRestrictionMessage(program));
        }

        const manager = options.profileManager || global.DepartmentProfileManager || null;
        const importApi = options.importApi || global.ProgramCommandImport || null;
        const storage = safeLocalStorage();
        if (!manager || typeof manager.listProfiles !== 'function' || typeof manager.loadProfile !== 'function') {
            throw new Error('Department profile manager is unavailable for debug reset.');
        }
        if (!storage) {
            throw new Error('Local storage is unavailable for debug reset.');
        }

        const listing = await manager.listProfiles();
        const profiles = Array.isArray(listing?.profiles) ? listing.profiles : [];
        const customEntries = profiles.filter((entry) => entry && entry.id && entry.source === 'custom-local');
        const matchingProfiles = [];

        for (const entry of customEntries) {
            const loaded = await loadMatchingProfile(program, entry.id, manager, 'custom-profile');
            if (!loaded) continue;
            matchingProfiles.push(loaded);
        }

        const customProfilesKey = String(manager.CUSTOM_PROFILES_STORAGE_KEY || 'programCommandCustomDepartmentProfilesV1').trim();
        const activeProfileStorageKey = String(manager.ACTIVE_PROFILE_STORAGE_KEY || 'programCommandActiveDepartmentProfileId').trim();
        const defaultProfileId = String(manager.DEFAULT_PROFILE_ID || 'design-v1').trim() || 'design-v1';
        const store = readJsonStorage(customProfilesKey) || {};
        const removedProfileIds = [];
        const removedScheduleKeys = [];

        matchingProfiles.forEach((entry) => {
            if (store && Object.prototype.hasOwnProperty.call(store, entry.profileId)) {
                delete store[entry.profileId];
                removedProfileIds.push(entry.profileId);
            }

            const prefix = String(entry.profile?.scheduler?.storageKeyPrefix || '').trim();
            if (!prefix) return;
            Object.keys(storage)
                .filter((key) => String(key).startsWith(prefix))
                .forEach((key) => {
                    storage.removeItem(key);
                    removedScheduleKeys.push(key);
                });
        });

        writeJsonStorage(customProfilesKey, store);

        const activeProfileId = String(manager.getStoredProfileId?.() || '').trim();
        if (removedProfileIds.includes(activeProfileId)) {
            storage.setItem(activeProfileStorageKey, defaultProfileId);
        }

        if (importApi && typeof importApi.readPendingOnboardingImport === 'function') {
            const pendingImport = importApi.readPendingOnboardingImport();
            if (pendingImport && String(pendingImport.programId || '').trim() === String(program.id || '').trim()) {
                importApi.clearPendingOnboardingImport?.();
            }
        }

        clearOnboardingContext();
        persistSelection(createProgramSelection({
            ...program,
            profileId: null,
            seededDefault: Boolean(program.seededDefault)
        }));

        return {
            removedProfileIds,
            removedScheduleKeys
        };
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
            programSelect: global.document.getElementById('programShellProgramSelect'),
            programMeta: global.document.getElementById('programShellProgramMeta'),
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
            chooserTitle: global.document.getElementById('programShellChooserTitle'),
            manualButton: global.document.getElementById('programShellManualButton'),
            spreadsheetButton: global.document.getElementById('programShellSpreadsheetButton'),
            screenshotDirectoryButton: global.document.getElementById('programShellScreenshotDirectoryButton'),
            screenshotButton: global.document.getElementById('programShellScreenshotButton'),
            spreadsheetInput: global.document.getElementById('programShellSpreadsheetInput'),
            screenshotDirectoryInput: global.document.getElementById('programShellScreenshotDirectoryInput'),
            screenshotInput: global.document.getElementById('programShellScreenshotInput'),
            screenshotSupportText: global.document.getElementById('programShellScreenshotSupportText'),
            chooserMeta: global.document.getElementById('programShellChooserMeta'),
            existingPanel: global.document.getElementById('programShellExistingPanel'),
            existingMeta: global.document.getElementById('programShellExistingMeta'),
            openExistingButton: global.document.getElementById('programShellOpenExistingButton'),
            newWorkspacePanel: global.document.getElementById('programShellNewWorkspacePanel'),
            debugPanel: global.document.getElementById('programShellDebugPanel'),
            debugSummary: global.document.getElementById('programShellDebugSummary'),
            resetProgramButton: global.document.getElementById('programShellResetProgramButton'),
            clearPendingImportButton: global.document.getElementById('programShellClearPendingImportButton'),
            copyDebugButton: global.document.getElementById('programShellCopyDebugButton'),
            status: global.document.getElementById('programShellStatus')
        };

        const state = {
            selectedProgram: pendingProgram || resolveStoredSelection(groups),
            session: null,
            previewMode: false,
            chooserVisible: false,
            chooserMode: null,
            detectedData: null,
            runtimeLaunched: false,
            pendingOnboardingImport,
            directoryUploadSupported: Boolean(elements.screenshotDirectoryInput && ('webkitdirectory' in elements.screenshotDirectoryInput)),
            debugSnapshot: null
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
            state.chooserMode = null;
            state.detectedData = null;
            if (elements.chooserMeta) {
                elements.chooserMeta.textContent = '';
            }
            if (elements.chooserTitle) {
                elements.chooserTitle.textContent = 'Choose workspace path';
            }
            if (elements.existingMeta) {
                elements.existingMeta.textContent = '';
            }
        }

        function renderProgramSelect() {
            if (!elements.programSelect) return;

            if (!elements.programSelect.dataset.ready) {
                flattenPrograms(groups).forEach((program) => {
                    if (!program || typeof program !== 'object') return;
                    const option = global.document.createElement('option');
                    option.value = String(program.id || '').trim();
                    option.textContent = formatProgramLabel(program);
                    elements.programSelect.appendChild(option);
                });
                elements.programSelect.dataset.ready = 'true';
            }

            elements.programSelect.value = String(state.selectedProgram?.id || '').trim();
        }

        function buildProgramMetaText(program) {
            if (!program) {
                return 'Choose a program to unlock the right workspace path.';
            }

            const code = String(program.suggestedCode || '').trim();
            if (program.seededDefault) {
                return `${formatProgramLabel(program)} is already seeded. Authenticate, then open the existing workspace.`;
            }
            if (!canImportIntoProgram(program)) {
                return `${formatProgramLabel(program)} is a shared workspace. Import one program at a time, then use shared views to see programs together in the grid.`;
            }

            const parts = ['Single program workspace'];
            if (code) {
                parts.push(`Code ${code}`);
            }
            parts.push('If a workspace exists, you will open it. If not, you can start a new one.');
            return parts.join(' · ');
        }

        function describeExistingWorkspace() {
            if (!state.selectedProgram || !state.detectedData?.hasData) {
                return 'An existing program workspace was detected for this selection.';
            }

            const source = String(state.detectedData.source || '').trim();
            const profileId = String(state.detectedData.profileId || state.selectedProgram.profileId || '').trim();
            const sourceLabel = source ? source.replace(/-/g, ' ') : 'existing data';

            if (source === 'embedded-runtime') {
                return `${formatProgramLabel(state.selectedProgram)} already ships with a seeded workspace.`;
            }
            if (profileId) {
                return `${formatProgramLabel(state.selectedProgram)} already has a workspace from ${sourceLabel}. Active profile: ${profileId}.`;
            }
            return `${formatProgramLabel(state.selectedProgram)} already has workspace data from ${sourceLabel}.`;
        }

        async function refreshDebugPanel() {
            if (!elements.debugPanel || !elements.debugSummary) {
                return;
            }

            const showDebug = Boolean(isLocalPreviewHost() && authSatisfied() && state.chooserVisible);
            elements.debugPanel.hidden = !showDebug;
            if (!showDebug) {
                return;
            }

            const pendingImport = importApi && typeof importApi.readPendingOnboardingImport === 'function'
                ? importApi.readPendingOnboardingImport()
                : null;
            state.pendingOnboardingImport = pendingImport;

            if (!state.selectedProgram) {
                elements.debugSummary.textContent = 'Choose a program to inspect workspace state.';
                if (elements.resetProgramButton) {
                    elements.resetProgramButton.disabled = true;
                }
                if (elements.clearPendingImportButton) {
                    elements.clearPendingImportButton.disabled = !pendingImport;
                }
                if (elements.copyDebugButton) {
                    elements.copyDebugButton.disabled = true;
                }
                return;
            }

            const requestedProgramId = String(state.selectedProgram.id || '').trim();
            const snapshot = await collectProgramWorkspaceDebug(state.selectedProgram, {
                profileManager: manager,
                importApi
            });
            if (requestedProgramId !== String(state.selectedProgram?.id || '').trim()) {
                return;
            }

            state.debugSnapshot = snapshot;
            const lines = [
                `Program: ${snapshot.program?.label || 'None'}`,
                `Workspace detected: ${snapshot.existingWorkspace ? 'yes' : 'no'}`,
                `Active profile: ${snapshot.activeProfileId || 'none'}`,
                `Pending review: ${snapshot.pendingImport ? `${snapshot.pendingImport.source || 'unknown'} (${snapshot.pendingImport.programId || 'unknown'})` : 'none'}`,
                `Storage keys: ${Array.isArray(snapshot.storageKeys) ? snapshot.storageKeys.length : 0}`
            ];
            elements.debugSummary.textContent = lines.join('\n');

            if (elements.resetProgramButton) {
                const canReset = canImportIntoProgram(state.selectedProgram);
                elements.resetProgramButton.disabled = !canReset;
                elements.resetProgramButton.title = canReset
                    ? 'Remove the current local workspace for the selected program'
                    : getImportRestrictionMessage(state.selectedProgram);
            }
            if (elements.clearPendingImportButton) {
                elements.clearPendingImportButton.disabled = !snapshot.pendingImport;
            }
            if (elements.copyDebugButton) {
                elements.copyDebugButton.disabled = false;
            }
        }

        function updateUi() {
            renderProgramSelect();
            const canImportSelection = canImportIntoProgram(state.selectedProgram);
            const showChooser = Boolean(state.chooserVisible && authSatisfied());
            const showExistingPanel = showChooser && state.chooserMode === 'existing';
            const showNewWorkspacePanel = showChooser && state.chooserMode === 'new';

            if (elements.summary) {
                elements.summary.textContent = state.selectedProgram
                    ? `${formatProgramLabel(state.selectedProgram)} selected. Authenticate, then continue to check for an existing workspace.`
                    : 'Choose a program to unlock the correct entry path.';
            }
            if (elements.programMeta) {
                elements.programMeta.textContent = buildProgramMetaText(state.selectedProgram);
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

            if (elements.spreadsheetButton) {
                elements.spreadsheetButton.disabled = !canImportSelection;
                elements.spreadsheetButton.title = canImportSelection
                    ? 'Import this program from an EagleNET spreadsheet'
                    : getImportRestrictionMessage(state.selectedProgram);
            }

            if (elements.screenshotDirectoryButton) {
                elements.screenshotDirectoryButton.hidden = !state.directoryUploadSupported;
                elements.screenshotDirectoryButton.disabled = !canImportSelection;
                elements.screenshotDirectoryButton.title = canImportSelection
                    ? 'Choose an EagleNET screenshot folder for this program'
                    : getImportRestrictionMessage(state.selectedProgram);
            }
            if (elements.screenshotSupportText) {
                const supportText = state.directoryUploadSupported
                    ? 'Folder upload keeps nested quarter folders when the browser supports directory selection.'
                    : 'This browser does not expose directory selection here, so use multiple screenshot files instead.';
                elements.screenshotSupportText.textContent = canImportSelection
                    ? supportText
                    : `${supportText} Import stays disabled until you choose a single program workspace.`;
            }
            if (elements.screenshotButton) {
                elements.screenshotButton.textContent = state.directoryUploadSupported
                    ? 'Choose EagleNET screenshot files'
                    : 'Choose EagleNET screenshots';
                elements.screenshotButton.disabled = !canImportSelection;
                elements.screenshotButton.title = canImportSelection
                    ? 'Choose EagleNET screenshots for this program'
                    : getImportRestrictionMessage(state.selectedProgram);
            }

            if (elements.chooser) {
                elements.chooser.hidden = !showChooser;
            }
            if (elements.backButton) {
                elements.backButton.hidden = !showChooser;
            }
            if (elements.chooserTitle) {
                if (state.chooserMode === 'existing') {
                    elements.chooserTitle.textContent = 'Open existing workspace';
                } else if (state.chooserMode === 'new') {
                    elements.chooserTitle.textContent = 'Start a new program workspace';
                } else if (state.chooserMode === 'unavailable') {
                    elements.chooserTitle.textContent = 'Shared workspace requires a source program';
                } else {
                    elements.chooserTitle.textContent = 'Choose workspace path';
                }
            }
            if (elements.existingPanel) {
                elements.existingPanel.hidden = !showExistingPanel;
            }
            if (elements.existingMeta) {
                elements.existingMeta.textContent = showExistingPanel ? describeExistingWorkspace() : '';
            }
            if (elements.openExistingButton) {
                elements.openExistingButton.disabled = !showExistingPanel || !state.selectedProgram;
            }
            if (elements.newWorkspacePanel) {
                elements.newWorkspacePanel.hidden = !showNewWorkspacePanel;
            }

            void refreshDebugPanel();
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

        async function openProgramWorkspace(program = state.selectedProgram, options = {}) {
            if (!program) {
                setStatus('error', 'Choose a program before opening a workspace.');
                return false;
            }

            const nextProfileId = String(
                options.profileId
                || state.detectedData?.profileId
                || program.profileId
                || ''
            ).trim();

            if (nextProfileId) {
                persistSelectedProgram(program, { profileId: nextProfileId });
            }

            if (manager && typeof manager.setActiveProfile === 'function' && nextProfileId) {
                try {
                    await manager.setActiveProfile(nextProfileId);
                } catch (error) {
                    setStatus('error', error?.message || 'Could not activate the selected profile.');
                    return false;
                }
            }

            clearOnboardingContext();
            state.chooserVisible = false;
            state.chooserMode = null;
            updateUi();
            setStatus('ok', options.statusMessage || `Opening ${formatProgramLabel(program)} in Program Command...`);

            if (!state.runtimeLaunched) {
                state.runtimeLaunched = true;
                overlay.hidden = true;
                await launchRuntime();
            }
            return true;
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

            const requestedProgramId = String(state.selectedProgram.id || '').trim();
            setStatus('info', `Checking ${formatProgramLabel(state.selectedProgram)} for existing program data...`);
            const dataState = await detectProgramData(state.selectedProgram, {
                profileManager: manager
            });
            if (requestedProgramId !== String(state.selectedProgram?.id || '').trim()) {
                return;
            }

            state.detectedData = dataState;
            state.chooserVisible = true;

            if (dataState.hasData) {
                const nextProfileId = String(dataState.profileId || state.selectedProgram.profileId || '').trim();
                if (nextProfileId) {
                    persistSelectedProgram(state.selectedProgram, { profileId: nextProfileId });
                }
                state.chooserMode = 'existing';
                if (elements.chooserMeta) {
                    elements.chooserMeta.textContent = `${formatProgramLabel(state.selectedProgram)} already has a workspace. Open it to continue planning.`;
                }
                updateUi();
                setStatus('ok', `${formatProgramLabel(state.selectedProgram)} already has a workspace. Open it to continue.`);
                return;
            }

            if (elements.chooserMeta) {
                elements.chooserMeta.textContent = canImportIntoProgram(state.selectedProgram)
                    ? `${formatProgramLabel(state.selectedProgram)} does not have seeded data yet. Start with manual setup or upload EagleNET screenshots/spreadsheets so we can ask for any missing clarification before building the grid.`
                    : `${getImportRestrictionMessage(state.selectedProgram)} Choose a specific program like Computer Science or Cybersecurity to create the first workspace.`;
            }
            state.chooserMode = canImportIntoProgram(state.selectedProgram) ? 'new' : 'unavailable';
            setStatus(
                canImportIntoProgram(state.selectedProgram) ? 'info' : 'warn',
                canImportIntoProgram(state.selectedProgram)
                    ? `${formatProgramLabel(state.selectedProgram)} is empty. Choose manual setup or upload data to start the first grid build.`
                    : `${formatProgramLabel(state.selectedProgram)} is a shared view. Start from a single program workspace first.`
            );
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

            state.detectedData = {
                hasData: true,
                source: 'pending-import',
                profileId: String(state.pendingOnboardingImport.profileId || resumedProgram.profileId || '').trim() || null
            };
            setStatus('info', `Resuming ${formatProgramLabel(resumedProgram)} import handoff...`);
            await openProgramWorkspace(resumedProgram, {
                profileId: String(state.pendingOnboardingImport.profileId || resumedProgram.profileId || '').trim() || null,
                statusMessage: `Resuming ${formatProgramLabel(resumedProgram)} import handoff...`
            });
            return true;
        }

        async function launchPendingImportReview(source, intake = {}) {
            if (!state.selectedProgram) {
                setStatus('error', 'Choose a program before starting an upload review.');
                return;
            }
            if (!authSatisfied()) {
                setStatus('error', 'Authenticate before opening the upload review.');
                return;
            }
            if (!state.chooserVisible || state.chooserMode !== 'new') {
                setStatus('error', 'Continue into the selected program before choosing an upload path.');
                return;
            }
            if (!canImportIntoProgram(state.selectedProgram)) {
                handleImportRestriction();
                return;
            }

            if (!importApi || typeof importApi.writePendingOnboardingImport !== 'function') {
                setStatus('error', 'Import review handoff is unavailable on this page.');
                return;
            }

            try {
                const sourceLabel = source === 'screenshot' ? 'screenshot' : 'spreadsheet';
                setStatus('info', `Preparing ${formatProgramLabel(state.selectedProgram)} ${sourceLabel} review...`);

                const ensuredProfile = await ensureProgramProfile(state.selectedProgram, {
                    profileManager: manager
                });
                const nextProfileId = String(ensuredProfile?.profileId || '').trim();
                if (!nextProfileId) {
                    throw new Error('Could not activate a program profile for this import.');
                }

                persistSelectedProgram(state.selectedProgram, {
                    profileId: nextProfileId,
                    seededDefault: false
                });

                importApi.writePendingOnboardingImport(
                    createPendingImportPayload(source, state.selectedProgram, nextProfileId, intake)
                );
                clearOnboardingContext();
                global.location.href = global.location.pathname;
            } catch (error) {
                setStatus('error', error?.message || 'Could not open the upload review.');
            }
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
            if (!state.chooserVisible || state.chooserMode !== 'new') {
                setStatus('error', 'Continue into the selected program before choosing an onboarding path.');
                return;
            }

            const context = createOnboardingContext(state.selectedProgram, {
                source,
                artifact: intake.artifact || null,
                artifactBatch: intake.artifactBatch || null,
                spreadsheetImport: intake.spreadsheetImport || null,
                screenshotImport: intake.screenshotImport || null
            });
            persistOnboardingContext(context);
            global.location.href = `${onboardingUrl}?source=${encodeURIComponent(source)}&program=${encodeURIComponent(context.id || '')}`;
        }

        function handleImportRestriction() {
            setStatus('warn', getImportRestrictionMessage(state.selectedProgram));
        }

        function handleScreenshotSelection(files, mode) {
            const artifactBatch = buildScreenshotArtifactBatch(files, {
                mode
            });

            if (!artifactBatch.count) {
                setStatus('error', 'Choose one or more EagleNET screenshot files to continue.');
                return;
            }

            if (!canImportIntoProgram(state.selectedProgram)) {
                handleImportRestriction();
                return;
            }

            const importApi = global.ProgramCommandImport;
            if (!importApi || typeof importApi.readScreenshotTextImportFromFiles !== 'function') {
                setStatus('error', 'Screenshot OCR import runtime is unavailable on this page.');
                return;
            }

            setStatus('info', `Running OCR on ${artifactBatch.count} EagleNET screenshot file${artifactBatch.count === 1 ? '' : 's'} before review...`);
            importApi.readScreenshotTextImportFromFiles(files, {
                onProgress: ({ index, total, fileName }) => {
                    setStatus('info', `OCR ${index + 1}/${total}: ${fileName}`);
                }
            })
                .then((screenshotImport) => {
                    if (!screenshotImport?.meta?.extractedTextCount) {
                        setStatus('error', 'OCR did not detect any readable source text in the selected EagleNET screenshots.');
                        return;
                    }

                    launchPendingImportReview('screenshot', {
                        artifactBatch,
                        screenshotImport
                    });
                })
                .catch((error) => {
                    setStatus('error', error?.message || 'Could not OCR the selected EagleNET screenshots.');
                });
        }

        renderProgramSelect();

        elements.programSelect?.addEventListener('change', (event) => {
            const nextProgramId = String(event.target?.value || '').trim();
            const nextProgram = findProgramById(nextProgramId, groups);

            if (!nextProgram) {
                state.selectedProgram = null;
                state.debugSnapshot = null;
                resetChooserDetails();
                clearStorageKey(SHELL_SELECTION_STORAGE_KEY);
                setStatus('info', 'Choose a program to begin.');
                updateUi();
                return;
            }

            persistSelectedProgram(nextProgram, {
                profileId: String(nextProgram.profileId || '').trim() || null
            });
            state.debugSnapshot = null;
            resetChooserDetails();
            setStatus(
                'info',
                authSatisfied()
                    ? `${formatProgramLabel(nextProgram)} selected. Continue to check for an existing workspace.`
                    : `${formatProgramLabel(nextProgram)} selected. Authenticate to continue.`
            );
            updateUi();
            if (!authSatisfied() && elements.email) {
                elements.email.focus();
            }
        });

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
        elements.openExistingButton?.addEventListener('click', () => {
            openProgramWorkspace(state.selectedProgram);
        });
        elements.backButton?.addEventListener('click', () => {
            resetChooserDetails();
            setStatus('info', 'Choose a different program or continue with the selected one when ready.');
            updateUi();
        });
        elements.manualButton?.addEventListener('click', () => {
            navigateToOnboarding('manual', null);
        });
        elements.spreadsheetButton?.addEventListener('click', () => {
            if (!canImportIntoProgram(state.selectedProgram)) {
                handleImportRestriction();
                return;
            }
            elements.spreadsheetInput?.click();
        });
        elements.screenshotDirectoryButton?.addEventListener('click', () => {
            if (!canImportIntoProgram(state.selectedProgram)) {
                handleImportRestriction();
                return;
            }
            elements.screenshotDirectoryInput?.click();
        });
        elements.screenshotButton?.addEventListener('click', () => {
            if (!canImportIntoProgram(state.selectedProgram)) {
                handleImportRestriction();
                return;
            }
            elements.screenshotInput?.click();
        });
        elements.resetProgramButton?.addEventListener('click', async () => {
            if (!state.selectedProgram) {
                setStatus('error', 'Choose a program before resetting a workspace.');
                return;
            }
            if (!canImportIntoProgram(state.selectedProgram)) {
                handleImportRestriction();
                return;
            }

            const confirmed = typeof global.confirm === 'function'
                ? global.confirm(`Reset the local ${formatProgramLabel(state.selectedProgram)} workspace? This removes local profiles and schedule data for that program.`)
                : true;
            if (!confirmed) {
                return;
            }

            try {
                const result = await resetProgramWorkspace(state.selectedProgram, {
                    profileManager: manager,
                    importApi
                });
                const freshProgram = findProgramById(state.selectedProgram.id, groups) || state.selectedProgram;
                persistSelectedProgram(freshProgram, {
                    profileId: null,
                    seededDefault: Boolean(freshProgram.seededDefault)
                });
                resetChooserDetails();
                setStatus(
                    'warn',
                    `Reset ${formatProgramLabel(freshProgram)}. Removed ${result.removedProfileIds.length} profile${result.removedProfileIds.length === 1 ? '' : 's'} and ${result.removedScheduleKeys.length} storage key${result.removedScheduleKeys.length === 1 ? '' : 's'}.`
                );
                updateUi();
                if (authSatisfied()) {
                    await handleContinue();
                }
            } catch (error) {
                setStatus('error', error?.message || 'Could not reset the selected workspace.');
            }
        });
        elements.clearPendingImportButton?.addEventListener('click', () => {
            if (!importApi || typeof importApi.clearPendingOnboardingImport !== 'function') {
                setStatus('error', 'Pending upload review storage is unavailable.');
                return;
            }
            importApi.clearPendingOnboardingImport();
            state.pendingOnboardingImport = null;
            setStatus('warn', 'Cleared the pending upload review handoff for this browser.');
            updateUi();
        });
        elements.copyDebugButton?.addEventListener('click', async () => {
            if (!state.selectedProgram) {
                setStatus('error', 'Choose a program before copying debug state.');
                return;
            }

            try {
                const snapshot = await collectProgramWorkspaceDebug(state.selectedProgram, {
                    profileManager: manager,
                    importApi
                });
                state.debugSnapshot = snapshot;
                if (!global.navigator?.clipboard || typeof global.navigator.clipboard.writeText !== 'function') {
                    throw new Error('Clipboard access is unavailable in this browser.');
                }
                await global.navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
                setStatus('ok', 'Copied the shell debug snapshot to the clipboard.');
                updateUi();
            } catch (error) {
                setStatus('error', error?.message || 'Could not copy the debug snapshot.');
            }
        });
        elements.spreadsheetInput?.addEventListener('change', (event) => {
            const file = event.target?.files?.[0];
            if (!file) return;

            if (!canImportIntoProgram(state.selectedProgram)) {
                event.target.value = '';
                handleImportRestriction();
                return;
            }
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

            setStatus('info', `Parsing ${file.name} before review...`);
            importApi.readTabularRowsFromFile(file)
                .then((spreadsheetImport) => {
                    if (!spreadsheetImport?.rows?.length) {
                        const warning = Array.isArray(spreadsheetImport?.meta?.warnings) && spreadsheetImport.meta.warnings.length
                            ? spreadsheetImport.meta.warnings[0]
                            : 'Spreadsheet did not contain any importable rows.';
                        setStatus('error', warning);
                        return;
                    }

                    launchPendingImportReview('spreadsheet', {
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
            event.target.value = '';
        });
        elements.screenshotInput?.addEventListener('change', (event) => {
            const files = Array.from(event.target?.files || []);
            if (!files.length) return;
            handleScreenshotSelection(files, 'files');
            event.target.value = '';
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
        buildAutomaticProgramProfile,
        createPendingImportPayload,
        ensureProgramProfile,
        profileMatchesProgram,
        collectProgramWorkspaceDebug,
        resetProgramWorkspace,
        canImportIntoProgram,
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
