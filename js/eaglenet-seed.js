(function eagleNetSeedRuntime(globalScope) {
    'use strict';

    const DEFAULT_SEED_FILE = 'data/eecs-eaglenet-seed.json';

    const DEFAULT_WORKSPACE_DEFINITIONS = Object.freeze({
        csee: {
            id: 'csee',
            label: 'CS/EE',
            displayName: 'Computer Science, Cybersecurity, and Electrical Engineering',
            profileIds: ['csee-chair-v1'],
            subjectCodes: ['CSCD', 'ELEC']
        },
        cyber: {
            id: 'cyber',
            label: 'Cyber',
            displayName: 'Cybersecurity',
            profileIds: ['cyber-chair-v1'],
            subjectCodes: ['CYBR']
        }
    });

    const BUILDING_CODE_MAP = Object.freeze({
        'Computer Engineering Bldg.': 'CEB',
        'Catalyst Building, Spokane': 'Catalyst'
    });

    const DISPLAY_ROOM_LABEL_MAP = Object.freeze({
        Cheney: 'CHN',
        'Catalyst Building, Spokane': 'CAT'
    });

    const DAY_LABELS = Object.freeze({
        M: 'Mon',
        T: 'Tue',
        W: 'Wed',
        R: 'Thu',
        F: 'Fri',
        S: 'Sat',
        U: 'Sun'
    });

    const QUARTER_ORDER = Object.freeze({
        fall: 0,
        winter: 1,
        spring: 2
    });

    const state = {
        loaded: false,
        loadingPromise: null,
        source: 'unloaded',
        seed: null,
        warnings: [],
        errors: []
    };

    function deepClone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function normalizeText(value) {
        return String(value == null ? '' : value)
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeTextUpper(value) {
        return normalizeText(value).toUpperCase();
    }

    function resolveSeedPath(path) {
        const explicitPath = normalizeText(path);
        if (explicitPath) return explicitPath;

        const pathname = normalizeText(globalScope?.location?.pathname).toLowerCase();
        if (pathname.includes('/pages/')) {
            return `../${DEFAULT_SEED_FILE}`;
        }
        return DEFAULT_SEED_FILE;
    }

    async function fetchJson(path) {
        try {
            const response = await fetch(path, { cache: 'no-store' });
            if (!response.ok) {
                return { ok: false, error: `HTTP ${response.status}` };
            }
            return { ok: true, value: await response.json() };
        } catch (error) {
            return { ok: false, error: error?.message || 'fetch failed' };
        }
    }

    function normalizeAcademicYear(rawTerm) {
        const term = normalizeText(rawTerm)
            .replace(/\bQuarter\b/gi, '')
            .trim();
        const match = term.match(/^(Fall|Winter|Spring)\s+(\d{4})$/i);
        if (!match) return '';

        const season = match[1].toLowerCase();
        const year = Number(match[2]);
        if (!Number.isFinite(year)) return '';

        if (season === 'fall') {
            return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
        }

        const startYear = year - 1;
        return `${startYear}-${String(year % 100).padStart(2, '0')}`;
    }

    function normalizeQuarter(rawTerm) {
        const term = normalizeText(rawTerm).toLowerCase();
        if (term.startsWith('fall')) return 'fall';
        if (term.startsWith('winter')) return 'winter';
        if (term.startsWith('spring')) return 'spring';
        return '';
    }

    function normalizeCourseCode(subjectCode, catalogNumber) {
        const subject = normalizeTextUpper(subjectCode);
        const number = normalizeTextUpper(catalogNumber);
        if (!subject || !number) return '';
        return `${subject} ${number}`;
    }

    function normalizeSection(value) {
        const raw = normalizeTextUpper(value);
        if (!raw) return '';
        const match = raw.match(/^0*([0-9]{1,3})([A-Z]?)$/);
        if (!match) return raw;
        return `${match[1].padStart(3, '0')}${match[2] || ''}`;
    }

    function normalizeDayPattern(value) {
        return normalizeTextUpper(value).replace(/[^MTWRFSU]/g, '');
    }

    function parseClockToMinutes(value) {
        const raw = normalizeTextUpper(value).replace(/\./g, '');
        if (!raw) return null;

        const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
        if (!match) return null;

        let hours = Number(match[1]);
        const minutes = Number(match[2] || 0);
        const meridian = match[3];
        if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
        if (hours === 12) hours = 0;
        if (meridian === 'PM') hours += 12;
        return (hours * 60) + minutes;
    }

    function formatMinutes(minutes) {
        if (!Number.isFinite(minutes)) return '';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    }

    function normalizeTimeSlot(rawValue) {
        const raw = normalizeText(rawValue);
        if (!raw) return null;

        const parts = raw.split(/\s*[-–—]\s*/);
        if (parts.length < 2) return null;

        const startMinutes = parseClockToMinutes(parts[0]);
        const endMinutes = parseClockToMinutes(parts[1]);
        if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return null;

        return {
            id: `${formatMinutes(startMinutes)}-${formatMinutes(endMinutes)}`,
            label: raw,
            alias: raw,
            startMinutes,
            endMinutes
        };
    }

    function normalizeBuildingCode(building) {
        const buildingValue = normalizeText(building);
        if (!buildingValue) return '';
        return BUILDING_CODE_MAP[buildingValue] || buildingValue;
    }

    function getRoomCode(building, room) {
        const buildingValue = normalizeText(building);
        const roomValue = normalizeTextUpper(room);
        if (!buildingValue || !roomValue) return '';

        if (buildingValue.toLowerCase() === 'arranged' || roomValue === 'XX') {
            return '';
        }

        const buildingCode = normalizeBuildingCode(buildingValue);
        if (!buildingCode) return '';
        return `${buildingCode} ${roomValue}`;
    }

    function getDisplayRoomPrefix(record) {
        const building = normalizeText(record?.building);
        const campus = normalizeText(record?.campus);

        if (DISPLAY_ROOM_LABEL_MAP[building]) return DISPLAY_ROOM_LABEL_MAP[building];
        if (DISPLAY_ROOM_LABEL_MAP[campus]) return DISPLAY_ROOM_LABEL_MAP[campus];
        return building || campus;
    }

    function buildRoomLabel(record) {
        const prefix = getDisplayRoomPrefix(record);
        const room = normalizeTextUpper(record?.room);
        if (prefix && room) return `${prefix} ${room}`;
        return [prefix, room].filter(Boolean).join(' ');
    }

    function normalizeNumber(value) {
        const normalized = normalizeText(value);
        if (!normalized) return null;
        const number = Number(normalized);
        return Number.isFinite(number) ? number : null;
    }

    function compareRoomCodes(left, right) {
        const leftText = normalizeText(left);
        const rightText = normalizeText(right);
        if (!leftText || !rightText) return leftText.localeCompare(rightText);

        const leftMatch = leftText.match(/^([A-Za-z]+)\s+(\d+)/);
        const rightMatch = rightText.match(/^([A-Za-z]+)\s+(\d+)/);
        if (leftMatch && rightMatch) {
            const buildingCompare = leftMatch[1].localeCompare(rightMatch[1]);
            if (buildingCompare !== 0) return buildingCompare;
            const leftRoom = Number(leftMatch[2]);
            const rightRoom = Number(rightMatch[2]);
            if (leftRoom !== rightRoom) return leftRoom - rightRoom;
        }

        return leftText.localeCompare(rightText);
    }

    function compareAcademicYears(left, right) {
        const leftStart = Number(String(left || '').split('-')[0]);
        const rightStart = Number(String(right || '').split('-')[0]);
        if (Number.isFinite(leftStart) && Number.isFinite(rightStart) && leftStart !== rightStart) {
            return leftStart - rightStart;
        }
        return String(left || '').localeCompare(String(right || ''));
    }

    function compareTerms(left, right) {
        const leftQuarter = normalizeQuarter(left);
        const rightQuarter = normalizeQuarter(right);
        const leftYear = normalizeAcademicYear(left);
        const rightYear = normalizeAcademicYear(right);
        const yearCompare = compareAcademicYears(leftYear, rightYear);
        if (yearCompare !== 0) return yearCompare;
        const quarterCompare = (QUARTER_ORDER[leftQuarter] ?? 99) - (QUARTER_ORDER[rightQuarter] ?? 99);
        if (quarterCompare !== 0) return quarterCompare;
        return String(left || '').localeCompare(String(right || ''));
    }

    function compareDayPatterns(left, right) {
        const order = ['M', 'T', 'W', 'R', 'F', 'S', 'U'];
        const leftChars = String(left || '').split('');
        const rightChars = String(right || '').split('');

        for (let index = 0; index < Math.max(leftChars.length, rightChars.length); index += 1) {
            const leftOrder = order.indexOf(leftChars[index]);
            const rightOrder = order.indexOf(rightChars[index]);
            if (leftOrder !== rightOrder) {
                return (leftOrder === -1 ? 99 : leftOrder) - (rightOrder === -1 ? 99 : rightOrder);
            }
        }

        return String(left || '').localeCompare(String(right || ''));
    }

    function buildDayPatternLabel(dayPattern) {
        const tokens = String(dayPattern || '').split('').filter(Boolean);
        if (!tokens.length) return '';
        return tokens.map((token) => DAY_LABELS[token] || token).join(' / ');
    }

    function buildWorkspaceDefinitionMap(rawSeed) {
        const workspaceMap = {};

        Object.values(DEFAULT_WORKSPACE_DEFINITIONS).forEach((definition) => {
            workspaceMap[definition.id] = {
                id: definition.id,
                label: definition.label,
                displayName: definition.displayName,
                profileIds: definition.profileIds.slice(),
                subjectCodes: definition.subjectCodes.slice()
            };
        });

        const metadataWorkspaces = rawSeed?.metadata?.workspaces && typeof rawSeed.metadata.workspaces === 'object'
            ? rawSeed.metadata.workspaces
            : {};

        Object.entries(metadataWorkspaces).forEach(([workspaceId, entry]) => {
            const base = workspaceMap[workspaceId] || {
                id: workspaceId,
                label: workspaceId,
                displayName: workspaceId,
                profileIds: [],
                subjectCodes: []
            };

            const subjectCodes = Array.isArray(entry?.subject_codes || entry?.subjectCodes)
                ? [...new Set((entry.subject_codes || entry.subjectCodes)
                    .map((value) => normalizeTextUpper(value))
                    .filter(Boolean))]
                : base.subjectCodes.slice();

            workspaceMap[workspaceId] = {
                id: workspaceId,
                label: normalizeText(entry?.label) || base.label,
                displayName: normalizeText(entry?.display_name || entry?.displayName) || base.displayName,
                profileIds: base.profileIds.slice(),
                subjectCodes
            };
        });

        return workspaceMap;
    }

    function getWorkspaceIdFromDefinitions(workspaceDefinitions, subjectCode, explicitWorkspaceId) {
        const explicit = normalizeText(explicitWorkspaceId);
        if (explicit && workspaceDefinitions[explicit]) {
            return explicit;
        }

        const normalizedCode = normalizeTextUpper(subjectCode);
        if (!normalizedCode) return '';

        const match = Object.values(workspaceDefinitions).find((workspace) =>
            Array.isArray(workspace.subjectCodes) && workspace.subjectCodes.includes(normalizedCode)
        );
        return match?.id || '';
    }

    function normalizeRecord(rawRecord, workspaceDefinitions) {
        const row = rawRecord && typeof rawRecord === 'object' ? rawRecord : {};
        const subjectCode = normalizeTextUpper(row.subjectCode || row.subject_code);
        const catalogNumber = normalizeTextUpper(row.catalogNumber || row.catalog_number);
        const workspaceId = getWorkspaceIdFromDefinitions(
            workspaceDefinitions,
            subjectCode,
            row.workspaceId || row.workspace_id
        );
        const quarter = normalizeQuarter(row.term || row.normalized_term);
        const academicYear = normalizeAcademicYear(row.term || row.normalized_term);
        const timeSlot = normalizeTimeSlot(row.meetingTime || row.meeting_time);
        const roomCode = getRoomCode(row.building, row.room);

        return {
            workspaceId,
            title: normalizeText(row.title),
            subjectDescription: normalizeText(row.subjectDescription || row.subject_description),
            subjectCode,
            catalogNumber,
            courseCode: normalizeCourseCode(subjectCode, catalogNumber),
            section: normalizeSection(row.section),
            creditHours: normalizeText(row.creditHours || row.credit_hours),
            creditHoursValue: normalizeNumber(row.creditHours || row.credit_hours),
            crn: normalizeText(row.crn),
            term: normalizeText(row.normalized_term || row.term).replace(/\bQuarter\b/gi, '').replace(/\s+/g, ' ').trim(),
            academicYear,
            quarter,
            instructorName: normalizeText(row.instructorName || row.instructor_name),
            meetingDays: normalizeTextUpper(row.meetingDays || row.meeting_days),
            dayPattern: normalizeDayPattern(row.meetingDays || row.meeting_days),
            meetingTime: normalizeText(row.meetingTime || row.meeting_time),
            timeSlot,
            meetingType: normalizeText(row.meetingType || row.meeting_type),
            campus: normalizeText(row.campus),
            building: normalizeText(row.building),
            room: normalizeTextUpper(row.room),
            roomCode,
            scheduleType: normalizeText(row.scheduleType || row.schedule_type),
            attribute: normalizeText(row.attribute),
            statusSummary: normalizeText(row.statusSummary || row.status_summary),
            seatsRemaining: normalizeText(row.seatsRemaining || row.seats_remaining),
            seatsRemainingValue: normalizeNumber(row.seatsRemaining || row.seats_remaining),
            seatsCapacity: normalizeText(row.seatsCapacity || row.seats_capacity),
            seatsCapacityValue: normalizeNumber(row.seatsCapacity || row.seats_capacity),
            waitlistRemaining: normalizeText(row.waitlistRemaining || row.waitlist_remaining),
            waitlistRemainingValue: normalizeNumber(row.waitlistRemaining || row.waitlist_remaining),
            waitlistCapacity: normalizeText(row.waitlistCapacity || row.waitlist_capacity),
            waitlistCapacityValue: normalizeNumber(row.waitlistCapacity || row.waitlist_capacity),
            rawMeetingText: normalizeText(row.rawMeetingText || row.raw_meeting_text),
            rawStatusText: normalizeText(row.rawStatusText || row.raw_status_text),
            confidenceNotes: normalizeText(row.confidenceNotes || row.confidence_notes),
            sourceImages: Array.isArray(row.sourceImages || row.source_images)
                ? [...new Set((row.sourceImages || row.source_images).map((value) => normalizeText(value)).filter(Boolean))]
                : []
        };
    }

    function isSchedulableRecord(record) {
        return Boolean(
            record.workspaceId
            && record.quarter
            && record.dayPattern
            && record.timeSlot
            && record.roomCode
        );
    }

    function buildExceptionReason(record) {
        if (!record.workspaceId) return 'No supported EECS workspace match.';
        if (!record.quarter) return 'No fall/winter/spring quarter match.';
        const building = normalizeText(record.building).toLowerCase();
        const room = normalizeTextUpper(record.room);
        if (!record.roomCode) {
            if (!building && !room) return 'Location is unspecified.';
            if (building === 'arranged' || room === 'XX') return 'Arranged section with no fixed room.';
        }
        if (!record.dayPattern) return 'Meeting days are blank or unsupported.';
        if (!record.timeSlot) return 'Meeting time is blank or unsupported.';
        if (!record.roomCode) return 'Room could not be mapped into the scheduler grid.';
        return 'Skipped for manual review.';
    }

    function formatExceptionLabel(record) {
        const pieces = [
            record.courseCode,
            record.section,
            record.term,
            normalizeText(record.title)
        ].filter(Boolean);
        return pieces.join(' · ');
    }

    function buildExceptionEntry(record, reasonOverride) {
        return {
            code: record.courseCode,
            section: record.section,
            title: record.title,
            term: record.term,
            reason: normalizeText(reasonOverride) || buildExceptionReason(record),
            label: formatExceptionLabel(record),
            roomLabel: buildRoomLabel(record),
            meetingLabel: [record.meetingDays, record.meetingTime].filter(Boolean).join(' '),
            sourceImages: record.sourceImages.slice()
        };
    }

    function buildWorkspaceSummary(workspaceDefinition, records) {
        const definition = workspaceDefinition || {
            id: '',
            label: '',
            displayName: '',
            profileIds: [],
            subjectCodes: []
        };

        const seedableRecords = records.filter(isSchedulableRecord);
        const exceptions = records
            .filter((record) => !isSchedulableRecord(record))
            .map((record) => buildExceptionEntry(record));

        const dayPatterns = [...new Set(seedableRecords.map((record) => record.dayPattern).filter(Boolean))]
            .sort(compareDayPatterns)
            .map((dayPattern) => ({
                id: dayPattern,
                label: buildDayPatternLabel(dayPattern),
                aliases: [dayPattern]
            }));

        const timeSlotMap = new Map();
        seedableRecords.forEach((record) => {
            if (!record.timeSlot?.id) return;
            if (!timeSlotMap.has(record.timeSlot.id)) {
                timeSlotMap.set(record.timeSlot.id, {
                    id: record.timeSlot.id,
                    label: record.timeSlot.label,
                    aliases: [record.timeSlot.alias],
                    startMinutes: record.timeSlot.startMinutes,
                    endMinutes: record.timeSlot.endMinutes
                });
                return;
            }

            const existing = timeSlotMap.get(record.timeSlot.id);
            existing.aliases = [...new Set([...existing.aliases, record.timeSlot.alias].filter(Boolean))];
        });
        const timeSlots = [...timeSlotMap.values()].sort((left, right) => left.startMinutes - right.startMinutes);

        const roomLabels = {};
        seedableRecords.forEach((record) => {
            if (!record.roomCode) return;
            roomLabels[record.roomCode] = buildRoomLabel(record) || record.roomCode;
        });

        const academicYears = [...new Set(records.map((record) => record.academicYear).filter(Boolean))]
            .sort(compareAcademicYears);
        const terms = [...new Set(records.map((record) => record.term).filter(Boolean))]
            .sort(compareTerms);
        const quarterCounts = seedableRecords.reduce((summary, record) => {
            summary[record.quarter] = (summary[record.quarter] || 0) + 1;
            return summary;
        }, { fall: 0, winter: 0, spring: 0 });

        return {
            id: definition.id,
            label: definition.label,
            displayName: definition.displayName,
            profileIds: Array.isArray(definition.profileIds) ? definition.profileIds.slice() : [],
            subjectCodes: Array.isArray(definition.subjectCodes) ? definition.subjectCodes.slice() : [],
            academicYears,
            terms,
            recordsCount: records.length,
            seedableCount: seedableRecords.length,
            exceptionCount: exceptions.length,
            allowedRooms: Object.keys(roomLabels).sort(compareRoomCodes),
            roomLabels,
            dayPatterns,
            timeSlots,
            quarterCounts,
            exceptions
        };
    }

    function buildMetadata(rawSeed, workspaceDefinitions, normalizedRecords) {
        const rawMetadata = rawSeed?.metadata && typeof rawSeed.metadata === 'object'
            ? rawSeed.metadata
            : {};

        const workspaces = {};
        Object.values(workspaceDefinitions).forEach((definition) => {
            workspaces[definition.id] = {
                label: definition.label,
                displayName: definition.displayName,
                subjectCodes: definition.subjectCodes.slice(),
                profileIds: definition.profileIds.slice()
            };
        });

        const workspaceCounts = normalizedRecords.reduce((summary, record) => {
            if (!record.workspaceId) return summary;
            summary[record.workspaceId] = (summary[record.workspaceId] || 0) + 1;
            return summary;
        }, {});

        return {
            version: Number(rawMetadata.version || rawSeed?.version || 1) || 1,
            sourceType: normalizeText(rawMetadata.source_type || rawMetadata.sourceType || rawSeed?.source_type || rawSeed?.sourceType) || 'EagleNET classroom view with enrollments',
            sourceFolder: normalizeText(rawMetadata.source_folder || rawMetadata.sourceFolder),
            sourceFile: normalizeText(rawMetadata.source_file || rawMetadata.sourceFile),
            generatedAt: normalizeText(rawMetadata.generated_at || rawMetadata.generatedAt),
            note: normalizeText(rawMetadata.note),
            workspaces,
            recordCount: normalizedRecords.length,
            workspaceCounts
        };
    }

    function normalizeSeed(rawSeed) {
        const raw = rawSeed && typeof rawSeed === 'object' ? rawSeed : {};
        const workspaceDefinitions = buildWorkspaceDefinitionMap(raw);
        const normalizedRecords = Array.isArray(raw.records)
            ? raw.records.map((record) => normalizeRecord(record, workspaceDefinitions)).filter(Boolean)
            : [];

        const workspaceIds = [...new Set([
            ...Object.keys(workspaceDefinitions),
            ...normalizedRecords.map((record) => record.workspaceId).filter(Boolean)
        ])].filter(Boolean);

        const workspaces = workspaceIds.map((workspaceId) => buildWorkspaceSummary(
            workspaceDefinitions[workspaceId] || {
                id: workspaceId,
                label: workspaceId,
                displayName: workspaceId,
                profileIds: [],
                subjectCodes: []
            },
            normalizedRecords.filter((record) => record.workspaceId === workspaceId)
        ));

        return {
            metadata: buildMetadata(raw, workspaceDefinitions, normalizedRecords),
            workspaces,
            records: normalizedRecords
        };
    }

    function makeSnapshot() {
        return {
            loaded: state.loaded,
            source: state.source,
            seed: deepClone(state.seed),
            warnings: state.warnings.slice(),
            errors: state.errors.slice()
        };
    }

    function reset() {
        state.loaded = false;
        state.loadingPromise = null;
        state.source = 'unloaded';
        state.seed = null;
        state.warnings = [];
        state.errors = [];
    }

    async function load(path = '', options = {}) {
        const config = options && typeof options === 'object' ? options : {};
        const forceReload = Boolean(config.forceReload);
        const requestedPath = resolveSeedPath(path);

        if (config.seedData && typeof config.seedData === 'object') {
            state.seed = normalizeSeed(config.seedData);
            state.source = 'memory';
            state.warnings = [];
            state.errors = [];
            state.loaded = true;
            return makeSnapshot();
        }

        if (!forceReload && state.loaded && state.source === requestedPath) {
            return makeSnapshot();
        }

        if (!forceReload && state.loadingPromise) {
            return state.loadingPromise;
        }

        state.loadingPromise = (async () => {
            const warnings = [];
            const errors = [];
            const response = await fetchJson(requestedPath);

            if (!response.ok) {
                warnings.push(`Could not load EagleNET seed data at ${requestedPath} (${response.error || 'unknown error'}).`);
                state.seed = normalizeSeed(null);
                state.source = 'fallback';
                state.warnings = warnings;
                state.errors = errors;
                state.loaded = true;
                return makeSnapshot();
            }

            state.seed = normalizeSeed(response.value);
            state.source = requestedPath;
            state.warnings = warnings;
            state.errors = errors;
            state.loaded = true;
            return makeSnapshot();
        })();

        try {
            return await state.loadingPromise;
        } finally {
            state.loadingPromise = null;
        }
    }

    function getWorkspaceSummary(workspaceId) {
        const normalizedId = normalizeText(workspaceId);
        if (!normalizedId) return null;
        const workspaces = Array.isArray(state.seed?.workspaces) ? state.seed.workspaces : [];
        return deepClone(workspaces.find((workspace) => workspace.id === normalizedId) || null);
    }

    function getWorkspaceRecords(workspaceId) {
        const normalizedId = normalizeText(workspaceId);
        if (!normalizedId) return [];
        const records = Array.isArray(state.seed?.records) ? state.seed.records : [];
        return deepClone(records.filter((record) => record.workspaceId === normalizedId));
    }

    function getWorkspaceIdForProfile(profileOrId) {
        const profileId = typeof profileOrId === 'object'
            ? normalizeText(profileOrId?.id)
            : normalizeText(profileOrId);
        if (!profileId) return '';

        const loadedWorkspaces = Array.isArray(state.seed?.workspaces) ? state.seed.workspaces : [];
        const loadedMatch = loadedWorkspaces.find((workspace) =>
            Array.isArray(workspace.profileIds) && workspace.profileIds.includes(profileId)
        );
        if (loadedMatch) return loadedMatch.id;

        const defaultMatch = Object.values(DEFAULT_WORKSPACE_DEFINITIONS).find((workspace) =>
            Array.isArray(workspace.profileIds) && workspace.profileIds.includes(profileId)
        );
        return defaultMatch?.id || '';
    }

    function getRuntimeConfig(workspaceId) {
        const summary = getWorkspaceSummary(workspaceId);
        if (!summary) return null;
        return {
            workspaceId: summary.id,
            label: summary.label,
            displayName: summary.displayName,
            academicYears: summary.academicYears.slice(),
            allowedRooms: summary.allowedRooms.slice(),
            roomLabels: deepClone(summary.roomLabels),
            dayPatterns: summary.dayPatterns.map((pattern) => ({
                id: pattern.id,
                label: pattern.label,
                aliases: Array.isArray(pattern.aliases) ? pattern.aliases.slice() : []
            })),
            timeSlots: summary.timeSlots.map((slot) => ({
                id: slot.id,
                label: slot.label,
                aliases: Array.isArray(slot.aliases) ? slot.aliases.slice() : [],
                startMinutes: slot.startMinutes,
                endMinutes: slot.endMinutes
            })),
            terms: summary.terms.slice(),
            quarterCounts: {
                fall: Number(summary.quarterCounts?.fall) || 0,
                winter: Number(summary.quarterCounts?.winter) || 0,
                spring: Number(summary.quarterCounts?.spring) || 0
            }
        };
    }

    function createEmptyQuarterDraft(dayPatterns) {
        const bucket = {
            ONLINE: { async: [] },
            ARRANGED: { arranged: [] }
        };

        (Array.isArray(dayPatterns) ? dayPatterns : []).forEach((pattern) => {
            if (!pattern?.id) return;
            bucket[pattern.id] = {};
        });

        return bucket;
    }

    function buildSchedulerDraft(options = {}) {
        const config = options && typeof options === 'object' ? options : {};
        const workspaceId = normalizeText(config.workspaceId || getWorkspaceIdForProfile(config.profileId));
        if (!workspaceId) {
            throw new Error('workspaceId is required.');
        }

        const targetAcademicYear = normalizeText(config.academicYear || config.targetAcademicYear);
        if (!targetAcademicYear) {
            throw new Error('academicYear is required.');
        }

        const runtimeConfig = getRuntimeConfig(workspaceId);
        if (!runtimeConfig) {
            throw new Error(`Unknown EagleNET workspace: ${workspaceId}`);
        }

        const workspaceRecords = getWorkspaceRecords(workspaceId);
        const availableAcademicYears = [...new Set(workspaceRecords.map((record) => record.academicYear).filter(Boolean))]
            .sort(compareAcademicYears);
        const sourceAcademicYear = normalizeText(config.sourceAcademicYear)
            || availableAcademicYears[availableAcademicYears.length - 1]
            || '';
        const recordsToSeed = sourceAcademicYear
            ? workspaceRecords.filter((record) => record.academicYear === sourceAcademicYear)
            : workspaceRecords.slice();

        const allowedRooms = new Set(runtimeConfig.allowedRooms);
        const draft = {
            fall: createEmptyQuarterDraft(runtimeConfig.dayPatterns),
            winter: createEmptyQuarterDraft(runtimeConfig.dayPatterns),
            spring: createEmptyQuarterDraft(runtimeConfig.dayPatterns)
        };
        const quarterCounts = { fall: 0, winter: 0, spring: 0 };
        const exceptions = [];
        let seededRecords = 0;

        recordsToSeed.forEach((record) => {
            if (!isSchedulableRecord(record)) {
                exceptions.push(buildExceptionEntry(record));
                return;
            }

            if (!allowedRooms.has(record.roomCode)) {
                exceptions.push(buildExceptionEntry(
                    record,
                    `Room ${record.roomCode} is not enabled for the current workspace.`
                ));
                return;
            }

            const quarter = record.quarter;
            if (!draft[quarter]) {
                exceptions.push(buildExceptionEntry(
                    record,
                    'Quarter could not be mapped into the scheduler draft.'
                ));
                return;
            }

            if (!draft[quarter][record.dayPattern]) {
                draft[quarter][record.dayPattern] = {};
            }
            if (!Array.isArray(draft[quarter][record.dayPattern][record.timeSlot.id])) {
                draft[quarter][record.dayPattern][record.timeSlot.id] = [];
            }

            draft[quarter][record.dayPattern][record.timeSlot.id].push({
                code: record.courseCode,
                name: record.title || record.courseCode,
                title: record.title,
                section: record.section || '',
                instructor: record.instructorName || 'TBD',
                credits: record.creditHoursValue || Number(record.creditHours) || 0,
                room: record.roomCode,
                academicYear: targetAcademicYear,
                sourceAcademicYear,
                source: 'eaglenet-manual-json',
                term: record.term,
                subjectCode: record.subjectCode,
                subjectDescription: record.subjectDescription,
                catalogNumber: record.catalogNumber,
                campus: record.campus,
                building: record.building,
                meetingDays: record.meetingDays,
                meetingTime: record.meetingTime,
                meetingType: record.meetingType,
                enrollmentStatus: record.statusSummary,
                enrollmentRemaining: record.seatsRemainingValue,
                enrollmentCapacity: record.seatsCapacityValue,
                waitlistRemaining: record.waitlistRemainingValue,
                waitlistCapacity: record.waitlistCapacityValue,
                rawMeetingText: record.rawMeetingText,
                rawStatusText: record.rawStatusText,
                confidenceNotes: record.confidenceNotes,
                sourceImages: record.sourceImages.slice()
            });

            quarterCounts[quarter] += 1;
            seededRecords += 1;
        });

        Object.keys(draft).forEach((quarter) => {
            Object.keys(draft[quarter]).forEach((dayPattern) => {
                Object.keys(draft[quarter][dayPattern]).forEach((timeSlotId) => {
                    draft[quarter][dayPattern][timeSlotId].sort((left, right) => (
                        normalizeText(left.code).localeCompare(normalizeText(right.code))
                        || normalizeText(left.section).localeCompare(normalizeText(right.section))
                    ));
                });
            });
        });

        return {
            workspaceId,
            academicYear: targetAcademicYear,
            sourceAcademicYear,
            draft,
            summary: {
                workspaceId,
                label: runtimeConfig.label,
                displayName: runtimeConfig.displayName,
                totalRecords: recordsToSeed.length,
                seededRecords,
                exceptionCount: exceptions.length,
                allowedRoomCount: runtimeConfig.allowedRooms.length,
                dayPatternCount: runtimeConfig.dayPatterns.length,
                timeSlotCount: runtimeConfig.timeSlots.length,
                quarterCounts,
                sourceTerms: [...new Set(recordsToSeed.map((record) => record.term).filter(Boolean))].sort(compareTerms),
                sourceType: normalizeText(state.seed?.metadata?.sourceType)
            },
            exceptions
        };
    }

    const api = {
        DEFAULT_SEED_PATH: DEFAULT_SEED_FILE,
        load,
        reset,
        getSnapshot: makeSnapshot,
        getWorkspaceSummary,
        getWorkspaceRecords,
        getWorkspaceIdForProfile,
        getRuntimeConfig,
        buildSchedulerDraft
    };

    if (globalScope) {
        globalScope.EagleNetSeed = api;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
