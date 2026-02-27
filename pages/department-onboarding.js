(function departmentOnboardingPage() {
    'use strict';

    const state = {
        manager: null,
        baseProfile: null,
        baseProfileSource: 'embedded-default',
        lastChecks: null
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
        profile.id = sanitizeBaseId(identity.code || identity.name || profile.id || 'department');
        profile.identity = {
            ...profile.identity,
            name: identity.name,
            code: identity.code,
            displayName: identity.displayName || identity.name,
            shortName: identity.shortName || identity.name
        };

        profile.scheduler = profile.scheduler || {};
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

        profile.onboardingMeta = {
            basedOn: String(qs('baseProfileSelect')?.value || ''),
            generatedAt: new Date().toISOString(),
            generatedBy: 'department-onboarding-shell-v1'
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

        if (!select.value && profileList.profiles.length > 0) {
            select.value = profileList.profiles[0].id;
        }

        if (select.value) {
            await loadBaseProfile(select.value);
        }
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
