(function departmentOnboardingPage() {
    'use strict';

    const state = {
        manager: null,
        baseProfile: null,
        baseProfileSource: 'embedded-default',
        lastChecks: null,
        handoffContext: null
    };

    function qs(id) {
        return document.getElementById(id);
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function sanitizeCode(rawValue) {
        return String(rawValue || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    function sanitizeBaseId(rawValue) {
        return String(rawValue || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+/, '')
            .replace(/-+$/, '')
            || 'department';
    }

    function buildStorageKeyPrefix(identity) {
        const base = sanitizeBaseId(identity?.code || identity?.shortName || identity?.name || 'department');
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

        const nextPrefix = sanitizeCode(nextCode);
        const previousPrefix = sanitizeCode(previousCode);
        if (!nextPrefix) return clone(courseMap);

        return Object.entries(courseMap).reduce((result, [courseCode, details]) => {
            const normalizedCode = String(courseCode || '').trim();
            let nextCourseCode = normalizedCode;
            if (previousPrefix) {
                const previousPattern = new RegExp(`^${previousPrefix}(\\s+\\d)`, 'i');
                nextCourseCode = normalizedCode.replace(previousPattern, `${nextPrefix}$1`);
            }
            result[nextCourseCode] = clone(details);
            return result;
        }, {});
    }

    function readHandoffContext() {
        if (window.ProgramCommandShell && typeof window.ProgramCommandShell.readOnboardingContext === 'function') {
            return window.ProgramCommandShell.readOnboardingContext();
        }
        try {
            const raw = localStorage.getItem('programCommandOnboardingContextV1');
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return null;
        }
    }

    function clearHandoffContext() {
        if (window.ProgramCommandShell && typeof window.ProgramCommandShell.clearOnboardingContext === 'function') {
            window.ProgramCommandShell.clearOnboardingContext();
            return;
        }
        try {
            localStorage.removeItem('programCommandOnboardingContextV1');
        } catch (error) {
            // Ignore storage cleanup failures.
        }
    }

    function renderHandoffContext(context) {
        const card = qs('handoffCard');
        if (!card || !context) return;

        const title = qs('handoffTitle');
        const summary = qs('handoffSummary');
        const artifact = qs('handoffArtifact');
        const badge = qs('handoffBadge');

        const label = String(context.label || 'Selected program').trim() || 'Selected program';
        const parentLabel = String(context.parentLabel || '').trim();
        const source = String(context.source || 'manual').trim() || 'manual';
        const artifactName = String(context.artifact?.name || '').trim();
        const sourceLabel = source === 'spreadsheet'
            ? 'Spreadsheet handoff'
            : source === 'screenshot'
                ? 'Screenshot handoff'
                : 'Manual setup handoff';

        if (badge) {
            badge.textContent = sourceLabel;
        }
        if (title) {
            title.textContent = `${label} onboarding handoff`;
        }
        if (summary) {
            summary.textContent = parentLabel
                ? `${parentLabel} / ${label} came from the Program Command start shell. Use this page to shape the first versioned profile and keep the selected program context intact.`
                : `${label} came from the Program Command start shell. Use this page to shape the first versioned profile and keep the selected program context intact.`;
        }
        if (artifact) {
            artifact.textContent = artifactName
                ? `Captured artifact: ${artifactName}. Parsing and seeded schedule generation continue in the follow-on import slice.`
                : source === 'manual'
                    ? 'No import artifact attached. Manual setup is active for this handoff.'
                    : 'No artifact metadata was carried into this handoff.';
        }

        card.hidden = false;
    }

    async function applyHandoffContext() {
        const context = state.handoffContext;
        if (!context) return;

        const select = qs('baseProfileSelect');
        const requestedBaseProfileId = String(context.baseProfileId || '').trim();
        if (requestedBaseProfileId && select && select.value !== requestedBaseProfileId) {
            const hasOption = Array.from(select.options).some((option) => option.value === requestedBaseProfileId);
            if (hasOption) {
                select.value = requestedBaseProfileId;
                await loadBaseProfile(requestedBaseProfileId);
            }
        }

        const identity = context.suggestedIdentity || {};
        if (identity.name) qs('departmentName').value = String(identity.name);
        if (identity.code) qs('departmentCode').value = sanitizeCode(identity.code);
        if (identity.displayName) qs('departmentDisplayName').value = String(identity.displayName);
        if (identity.shortName) qs('departmentShortName').value = String(identity.shortName);

        renderHandoffContext(context);

        const label = String(context.label || 'selected program').trim() || 'selected program';
        const source = String(context.source || 'manual').trim() || 'manual';
        if (source === 'spreadsheet') {
            setStatus('info', `Spreadsheet handoff ready for ${label}. Finish the profile setup here before the import mapping slice lands.`);
        } else if (source === 'screenshot') {
            setStatus('warn', `Screenshot handoff captured for ${label}. OCR/import parsing is staged after the spreadsheet path, but program context is preserved here.`);
        } else {
            setStatus('info', `Manual setup handoff ready for ${label}.`);
        }
    }

    function parseListLines(rawText) {
        return String(rawText || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
    }

    function parseAliasLines(rawText) {
        const aliases = {};
        const errors = [];
        parseListLines(rawText).forEach((line, index) => {
            const splitIndex = line.indexOf('=');
            if (splitIndex <= 0 || splitIndex === line.length - 1) {
                errors.push(`Line ${index + 1}: use format alias=canonical`);
                return;
            }
            const alias = line.slice(0, splitIndex).trim();
            const canonical = line.slice(splitIndex + 1).trim();
            if (!alias || !canonical) {
                errors.push(`Line ${index + 1}: alias/canonical cannot be empty`);
                return;
            }
            aliases[alias] = canonical;
        });

        return { aliases, errors };
    }

    function setStatus(kind, message) {
        const statusEl = qs('onboardingStatus');
        if (!statusEl) return;
        statusEl.className = `onboarding-status ${kind}`;
        statusEl.textContent = message;
    }

    function renderHealthChecks(checks) {
        const wrap = qs('healthCheckOutput');
        if (!wrap) return;
        wrap.innerHTML = '';

        const renderGroup = (title, items, cssClass) => {
            if (!items.length) return;
            const section = document.createElement('div');
            section.className = `check-group ${cssClass}`;

            const h4 = document.createElement('h4');
            h4.textContent = title;
            section.appendChild(h4);

            const ul = document.createElement('ul');
            items.forEach((item) => {
                const li = document.createElement('li');
                li.textContent = item;
                ul.appendChild(li);
            });
            section.appendChild(ul);
            wrap.appendChild(section);
        };

        renderGroup('Errors', checks.errors, 'error');
        renderGroup('Warnings', checks.warnings, 'warning');
        renderGroup('Passes', checks.passes, 'pass');

        if (!checks.errors.length && !checks.warnings.length && !checks.passes.length) {
            wrap.textContent = 'No checks run yet.';
        }
    }

    function applyOnboardingTextSlots(profile) {
        const textSlots = profile && profile.branding && profile.branding.textSlots && typeof profile.branding.textSlots === 'object'
            ? profile.branding.textSlots
            : {};
        const appHeader = document.querySelector('app-header');
        if (appHeader) {
            const eyebrow = String(textSlots.onboardingEyebrow || profile?.branding?.headerEyebrow || '').trim();
            const title = String(textSlots.onboardingTitle || '').trim();
            const subtitle = String(textSlots.onboardingSubtitle || '').trim();
            if (eyebrow) appHeader.setAttribute('eyebrow', eyebrow);
            if (title) appHeader.setAttribute('title-text', title);
            if (subtitle) appHeader.setAttribute('subtitle', subtitle);
        }

        const bindings = {
            step1Title: textSlots.onboardingStep1Title,
            step1Help: textSlots.onboardingStep1Help,
            step2Title: textSlots.onboardingStep2Title,
            step2Help: textSlots.onboardingStep2Help,
            step3Title: textSlots.onboardingStep3Title,
            step3Help: textSlots.onboardingStep3Help,
            statusTitle: textSlots.onboardingStatusTitle
        };

        Object.entries(bindings).forEach(([elementId, value]) => {
            const text = String(value || '').trim();
            if (!text) return;
            const element = qs(elementId);
            if (element) {
                element.textContent = text;
            }
        });
    }

    function readIdentityInputs() {
        const name = String(qs('departmentName')?.value || '').trim();
        const code = sanitizeCode(qs('departmentCode')?.value || '');
        const displayName = String(qs('departmentDisplayName')?.value || '').trim();
        const shortName = String(qs('departmentShortName')?.value || '').trim();
        return { name, code, displayName, shortName };
    }

    function buildDraftProfile() {
        if (!state.baseProfile) {
            throw new Error('Base profile is not loaded yet.');
        }

        const identity = readIdentityInputs();
        const rooms = parseListLines(qs('roomListInput')?.value || '');
        const facultyAliasParse = parseAliasLines(qs('facultyAliasInput')?.value || '');
        const courseAliasParse = parseAliasLines(qs('courseAliasInput')?.value || '');

        const profile = clone(state.baseProfile);
        const previousCode = String(profile.identity?.code || '').trim();
        profile.id = sanitizeBaseId(identity.code || identity.name || profile.id || 'department');
        profile.identity = {
            ...profile.identity,
            name: identity.name,
            code: identity.code,
            displayName: identity.displayName || identity.name,
            shortName: identity.shortName || identity.name
        };

        profile.branding = profile.branding || {};
        profile.branding.appTitle = `Program Command - ${profile.identity.displayName}`;
        profile.branding.headerEyebrow = `${profile.identity.displayName.toUpperCase()} · PROGRAM COMMAND`;
        profile.branding.headerSubtitle = `${profile.identity.shortName} Program Planning and Schedule Operations`;

        profile.scheduler = profile.scheduler || {};
        profile.scheduler.storageKeyPrefix = buildStorageKeyPrefix(profile.identity);
        profile.scheduler.allowedRooms = rooms;

        const existingRoomLabels = profile.scheduler.roomLabels && typeof profile.scheduler.roomLabels === 'object'
            ? profile.scheduler.roomLabels
            : {};
        const nextRoomLabels = {};
        rooms.forEach((room) => {
            nextRoomLabels[room] = existingRoomLabels[room] || room;
        });
        profile.scheduler.roomLabels = nextRoomLabels;

        profile.import = profile.import || {};
        profile.import.clss = profile.import.clss || {};
        profile.import.clss.roomMatchPriority = rooms.slice();
        profile.import.clss.facultyAliases = facultyAliasParse.aliases;
        profile.import.clss.courseAliases = courseAliasParse.aliases;

        profile.workload = profile.workload || {};
        profile.workload.dashboardTitle = String(profile.workload.dashboardTitle || 'Faculty Workload Dashboard').trim() || 'Faculty Workload Dashboard';
        profile.workload.dashboardSubtitleBase = `${profile.identity.displayName} Department - Academic Workload Analysis`;
        const resetYear = getNextAcademicYearLabel(profile.academic?.defaultSchedulerYear);
        if (resetYear) {
            profile.workload.productionResetDefaultScheduleYear = resetYear;
        }
        if (profile.workload.appliedLearningCourses && typeof profile.workload.appliedLearningCourses === 'object' && !Array.isArray(profile.workload.appliedLearningCourses)) {
            profile.workload.appliedLearningCourses = remapDepartmentCourseCodes(
                profile.workload.appliedLearningCourses,
                profile.identity.code,
                previousCode
            );
        }

        profile.onboardingMeta = {
            basedOn: String(qs('baseProfileSelect')?.value || ''),
            generatedAt: new Date().toISOString(),
            generatedBy: 'department-onboarding-shell-v1',
            catalogProgramId: String(state.handoffContext?.id || '').trim() || null,
            catalogProgramLabel: String(state.handoffContext?.label || '').trim() || null,
            previousCode: previousCode || null
        };

        return {
            profile,
            parseErrors: [...facultyAliasParse.errors, ...courseAliasParse.errors]
        };
    }

    function runHealthChecks() {
        const checks = {
            errors: [],
            warnings: [],
            passes: []
        };

        let draft = null;
        try {
            draft = buildDraftProfile();
        } catch (error) {
            checks.errors.push(error?.message || String(error));
            return { checks, draft: null };
        }

        const profile = draft.profile;
        const identity = profile.identity || {};

        if (!identity.name) checks.errors.push('Department name is required.');
        if (!identity.code) checks.errors.push('Department code is required.');
        if (identity.code && !/^[A-Z0-9]{2,8}$/.test(identity.code)) {
            checks.errors.push('Department code must be 2-8 uppercase letters/numbers.');
        }
        if (!identity.displayName) checks.errors.push('Department display name is required.');

        const rooms = Array.isArray(profile.scheduler?.allowedRooms) ? profile.scheduler.allowedRooms : [];
        if (!rooms.length) {
            checks.errors.push('At least one room is required for scheduler activation.');
        } else {
            checks.passes.push(`${rooms.length} rooms mapped.`);
        }

        if (!Array.isArray(profile.scheduler?.dayPatterns) || profile.scheduler.dayPatterns.length === 0) {
            checks.errors.push('Scheduler day patterns are missing.');
        } else {
            checks.passes.push(`Day patterns available: ${profile.scheduler.dayPatterns.length}.`);
        }

        if (!Array.isArray(profile.scheduler?.timeSlots) || profile.scheduler.timeSlots.length === 0) {
            checks.errors.push('Scheduler time slots are missing.');
        } else {
            checks.passes.push(`Time slots available: ${profile.scheduler.timeSlots.length}.`);
        }

        const facultyAliases = profile.import?.clss?.facultyAliases || {};
        const courseAliases = profile.import?.clss?.courseAliases || {};

        if (Object.keys(facultyAliases).length === 0) {
            checks.warnings.push('No faculty aliases entered (recommended for CLSS imports).');
        } else {
            checks.passes.push(`${Object.keys(facultyAliases).length} faculty aliases mapped.`);
        }

        if (Object.keys(courseAliases).length === 0) {
            checks.warnings.push('No course aliases entered (recommended for CLSS imports).');
        } else {
            checks.passes.push(`${Object.keys(courseAliases).length} course aliases mapped.`);
        }

        if (draft.parseErrors.length > 0) {
            draft.parseErrors.forEach((err) => checks.errors.push(err));
        }

        const validation = state.manager.validateProfile(profile);
        if (!validation.valid) {
            validation.errors.forEach((err) => checks.errors.push(`Profile validation: ${err}`));
        }
        validation.warnings.forEach((warn) => checks.warnings.push(`Profile validation: ${warn}`));

        return {
            checks,
            draft: {
                profile,
                baseId: sanitizeBaseId(identity.code || identity.name || 'department')
            }
        };
    }

    async function loadBaseProfile(profileId) {
        const loadingState = qs('baseProfileState');
        if (loadingState) {
            loadingState.textContent = 'Loading base profile...';
        }

        const loaded = await state.manager.loadProfile(profileId);
        state.baseProfile = loaded.profile;
        state.baseProfileSource = loaded.source;
        applyOnboardingTextSlots(loaded.profile);

        const identity = loaded.profile.identity || {};
        qs('departmentName').value = identity.name || '';
        qs('departmentCode').value = identity.code || '';
        qs('departmentDisplayName').value = identity.displayName || '';
        qs('departmentShortName').value = identity.shortName || '';

        const rooms = Array.isArray(loaded.profile.scheduler?.allowedRooms)
            ? loaded.profile.scheduler.allowedRooms
            : [];
        qs('roomListInput').value = rooms.join('\n');

        const facultyAliases = loaded.profile.import?.clss?.facultyAliases || {};
        const courseAliases = loaded.profile.import?.clss?.courseAliases || {};

        qs('facultyAliasInput').value = Object.entries(facultyAliases)
            .map(([alias, canonical]) => `${alias}=${canonical}`)
            .join('\n');
        qs('courseAliasInput').value = Object.entries(courseAliases)
            .map(([alias, canonical]) => `${alias}=${canonical}`)
            .join('\n');

        if (loadingState) {
            const sourceLabel = loaded.source === 'custom-local' ? 'custom local profile' : 'manifest profile';
            loadingState.textContent = `Loaded ${profileId} (${sourceLabel}).`;
        }

        if (loaded.warnings.length) {
            setStatus('warn', loaded.warnings.join(' | '));
        } else {
            setStatus('ok', `Base profile ${profileId} loaded.`);
        }
    }

    async function populateProfileSelect() {
        const select = qs('baseProfileSelect');
        if (!select) return;

        const profileList = await state.manager.listProfiles();
        select.innerHTML = '';

        profileList.profiles.forEach((profileEntry) => {
            const option = document.createElement('option');
            option.value = profileEntry.id;
            const sourceTag = profileEntry.source === 'custom-local' ? 'local' : 'manifest';
            option.textContent = `${profileEntry.id} (${sourceTag})`;
            select.appendChild(option);
        });

        const stored = state.manager.getStoredProfileId();
        if (stored && profileList.profiles.some((entry) => entry.id === stored)) {
            select.value = stored;
        }

        const requestedBaseProfileId = String(state.handoffContext?.baseProfileId || '').trim();
        if (requestedBaseProfileId && profileList.profiles.some((entry) => entry.id === requestedBaseProfileId)) {
            select.value = requestedBaseProfileId;
        }

        if (!select.value && profileList.profiles.length > 0) {
            select.value = profileList.profiles[0].id;
        }

        if (select.value) {
            await loadBaseProfile(select.value);
        }

        await applyHandoffContext();
    }

    function bindEvents() {
        qs('baseProfileSelect')?.addEventListener('change', async (event) => {
            const profileId = String(event.target.value || '').trim();
            if (!profileId) return;
            await loadBaseProfile(profileId);
        });

        qs('runHealthChecksButton')?.addEventListener('click', () => {
            const result = runHealthChecks();
            state.lastChecks = result;
            renderHealthChecks(result.checks);
            if (result.checks.errors.length > 0) {
                setStatus('error', `Health checks failed (${result.checks.errors.length} error${result.checks.errors.length === 1 ? '' : 's'}).`);
            } else if (result.checks.warnings.length > 0) {
                setStatus('warn', `Health checks passed with ${result.checks.warnings.length} warning${result.checks.warnings.length === 1 ? '' : 's'}.`);
            } else {
                setStatus('ok', 'Health checks passed. Ready to activate.');
            }
        });

        qs('saveActivateButton')?.addEventListener('click', async () => {
            const result = runHealthChecks();
            state.lastChecks = result;
            renderHealthChecks(result.checks);

            if (result.checks.errors.length > 0 || !result.draft) {
                setStatus('error', 'Fix health check errors before activation.');
                return;
            }

            try {
                qs('saveActivateButton').disabled = true;
                setStatus('info', 'Saving versioned profile and activating...');

                const saved = await state.manager.saveCustomProfile(result.draft.profile, {
                    baseId: result.draft.baseId,
                    activate: true
                });

                clearHandoffContext();
                qs('activationResult').textContent = `Activated profile ${saved.profileId}.`;
                setStatus('ok', `Profile ${saved.profileId} saved and activated.`);
                await populateProfileSelect();
                qs('baseProfileSelect').value = saved.profileId;
            } catch (error) {
                setStatus('error', error?.message || 'Could not save profile.');
            } finally {
                qs('saveActivateButton').disabled = false;
            }
        });
    }

    async function init() {
        const manager = window.DepartmentProfileManager;
        if (!manager || typeof manager.initialize !== 'function') {
            setStatus('error', 'Department profile manager is not available on this page.');
            return;
        }

        state.manager = manager;
        state.handoffContext = readHandoffContext();
        await manager.initialize();
        bindEvents();
        await populateProfileSelect();

        const result = runHealthChecks();
        state.lastChecks = result;
        renderHealthChecks(result.checks);
    }

    document.addEventListener('DOMContentLoaded', () => {
        init().catch((error) => {
            setStatus('error', error?.message || String(error));
        });
    });
})();
