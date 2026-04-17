/**
 * Constraints Dashboard Controller
 * Canonical, database-aware view for scheduling constraints.
 */

let rules = createEmptyRules();
let editingConstraint = null;
let currentMode = 'loading';
let facultyRecords = [];
let courseRecords = [];
let roomRecords = [];
let constraintRecords = [];
let facultyPreferenceRows = [];
let facultyList = [];
let courseList = [];
let runtimeDataSources = {};

const DEFAULT_TIME_SLOTS = ['morning', 'afternoon', 'evening'];
const DEFAULT_DAY_PATTERNS = ['MW', 'TR'];
const FALLBACK_ROOMS = {
    catalyst: ['206', '209', '210', '212'],
    cheney: ['CEB 102', 'CEB 104']
};

document.addEventListener('DOMContentLoaded', async function() {
    await refreshDashboardData({ quiet: true });
});

function createEmptyRules() {
    return {
        courseConstraints: [],
        facultyConstraints: [],
        facultyPreferences: [],
        roomConstraints: [],
        caseByCase: {
            courses: [],
            descriptions: {},
            entries: []
        }
    };
}

function ensureArray(value, fallback = []) {
    return Array.isArray(value) ? value : fallback;
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function normalizeCampusId(campus) {
    const normalized = String(campus || '').trim().toLowerCase();
    if (!normalized) return '';
    if (normalized.includes('spokane') || normalized.includes('catalyst')) return 'catalyst';
    if (normalized.includes('cheney')) return 'cheney';
    return normalized;
}

function formatCampusLabel(campusId) {
    if (campusId === 'catalyst') return 'Catalyst';
    if (campusId === 'cheney') return 'Cheney';
    return campusId || 'Any campus';
}

function sameStringArray(left = [], right = []) {
    if (left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
}

function getRoomCode(room) {
    return String(room?.room_code || room?.id || '').trim();
}

function getRoomDisplayName(room) {
    return String(room?.name || getRoomCode(room) || '').trim();
}

function getAllRoomCodes() {
    if (roomRecords.length > 0) {
        return roomRecords
            .map((room) => getRoomCode(room))
            .filter(Boolean);
    }

    return [
        ...FALLBACK_ROOMS.catalyst,
        ...FALLBACK_ROOMS.cheney
    ];
}

function setStatusText(message, state = 'saved') {
    const status = document.getElementById('statusText');
    if (!status) return;

    status.textContent = message;
    status.classList.toggle('unsaved', state === 'warning');
}

function setRuntimeDataSourceStatus(key, status) {
    runtimeDataSources[key] = { ...(runtimeDataSources[key] || {}), ...status };
    renderRuntimeDataSourceBanner();
}

function syncRuntimeDataSourcesFromDbService() {
    if (typeof dbService === 'undefined' || typeof dbService.getRuntimeSourceStatus !== 'function') {
        return;
    }

    const statuses = dbService.getRuntimeSourceStatus();
    Object.entries(statuses?.entries || {}).forEach(([key, value]) => {
        if (value) {
            setRuntimeDataSourceStatus(key, value);
        }
    });
}

function getRuntimeDataSourceSummary() {
    const entries = Object.values(runtimeDataSources).filter(Boolean);
    const fallbackEntries = entries.filter((entry) => !entry.canonical);
    const canonicalEntries = entries.filter((entry) => entry.canonical);

    return {
        entries,
        fallbackEntries,
        canonicalEntries,
        hasFallbacks: fallbackEntries.length > 0,
        fallbackCount: fallbackEntries.length,
        canonicalCount: canonicalEntries.length
    };
}

function renderRuntimeDataSourceBanner() {
    const banner = document.getElementById('runtimeDataSourceBanner');
    if (!banner) return;

    const summary = getRuntimeDataSourceSummary();
    if (summary.entries.length === 0) {
        banner.hidden = true;
        banner.textContent = '';
        banner.className = 'runtime-source-banner';
        return;
    }

    banner.hidden = false;

    if (summary.hasFallbacks) {
        const labels = summary.fallbackEntries.map((entry) => entry.label).join(', ');
        banner.className = 'runtime-source-banner runtime-source-banner-warning';
        banner.innerHTML = `
            <strong>Constraints dashboard still depends on fallback data.</strong>
            <span>Review these inputs before treating this page as canonical: ${escapeHtml(labels)}.</span>
        `;
        return;
    }

    banner.className = 'runtime-source-banner runtime-source-banner-success';
    banner.innerHTML = `
        <strong>Constraints dashboard is connected to canonical persisted sources.</strong>
        <span>${summary.canonicalCount} tracked runtime inputs are loading from the develop database.</span>
    `;
}

function getCourseConstraintEntries(courses = []) {
    return courses
        .filter((course) => {
            const preferredTimes = ensureArray(course.preferred_times, DEFAULT_TIME_SLOTS);
            const preferredDays = ensureArray(course.preferred_days, DEFAULT_DAY_PATTERNS);
            const allowedRooms = ensureArray(course.allowed_rooms);

            return allowedRooms.length > 0 ||
                Boolean(course.allowed_campus) ||
                !sameStringArray(preferredTimes, DEFAULT_TIME_SLOTS) ||
                !sameStringArray(preferredDays, DEFAULT_DAY_PATTERNS) ||
                Boolean(course.room_constraint_hard) ||
                Boolean(course.time_constraint_hard);
        })
        .map((course) => ({
            id: course.id,
            courseId: course.id,
            code: course.code,
            title: course.title,
            allowedCampus: course.allowed_campus || '',
            allowedRooms: ensureArray(course.allowed_rooms),
            preferredTimes: ensureArray(course.preferred_times, DEFAULT_TIME_SLOTS),
            preferredDays: ensureArray(course.preferred_days, DEFAULT_DAY_PATTERNS),
            roomConstraintHard: Boolean(course.room_constraint_hard),
            timeConstraintHard: Boolean(course.time_constraint_hard)
        }))
        .sort((left, right) => left.code.localeCompare(right.code));
}

function getFacultyConstraintEntries(constraints = []) {
    return constraints
        .filter((constraint) => {
            const normalizedType = String(constraint.constraint_type || '').trim().toLowerCase();
            return [
                'campus_transition',
                'evening_safety',
                'faculty_double_book'
            ].includes(normalizedType);
        })
        .map((constraint) => {
            const type = String(constraint.constraint_type || '').trim().toLowerCase();
            const ruleDetails = constraint.rule_details || {};

            if (type === 'campus_transition') {
                const bufferMinutes = Number(
                    ruleDetails.travel_buffer_minutes ||
                    (ruleDetails.min_gap_hours ? Number(ruleDetails.min_gap_hours) * 60 : 30)
                ) || 30;

                return {
                    id: constraint.id,
                    sourceConstraintId: constraint.id,
                    constraintType: constraint.constraint_type,
                    enabled: constraint.enabled !== false,
                    editable: true,
                    type: 'travel-time',
                    rule: 'no-back-to-back-different-campus',
                    title: 'Campus Travel Buffer',
                    details: constraint.description || ruleDetails.message || 'Faculty need time to travel between campuses.',
                    bufferMinutes,
                    ruleDetails
                };
            }

            if (type === 'evening_safety') {
                return {
                    id: constraint.id,
                    sourceConstraintId: constraint.id,
                    constraintType: constraint.constraint_type,
                    enabled: constraint.enabled !== false,
                    editable: true,
                    type: 'safety',
                    rule: 'minimum-instructors-evening',
                    title: 'Evening Safety Pairing',
                    details: constraint.description || ruleDetails.message || 'Evening sections need multiple instructors present.',
                    minimumCount: Number(ruleDetails.min_instructors || 2),
                    afterTime: String(ruleDetails.time_after || '16:00'),
                    ruleDetails
                };
            }

            return {
                id: constraint.id,
                sourceConstraintId: constraint.id,
                constraintType: constraint.constraint_type,
                enabled: constraint.enabled !== false,
                editable: false,
                type: 'readonly',
                title: constraint.description || 'Faculty Scheduling Constraint',
                details: ruleDetails.message || constraint.description || constraint.constraint_type,
                ruleDetails
            };
        })
        .sort((left, right) => left.title.localeCompare(right.title));
}

function getRoomConstraintEntries(rooms = [], constraints = []) {
    const entries = [];

    rooms.forEach((room) => {
        if (!room.exclude_from_grid) return;

        entries.push({
            id: `room-${room.id}`,
            sourceType: 'room',
            sourceRoomId: room.id,
            room: getRoomCode(room),
            roomName: getRoomDisplayName(room),
            enabled: true,
            type: 'exclude-from-grid',
            reason: `${getRoomDisplayName(room) || getRoomCode(room)} is excluded from the scheduling grid.`
        });
    });

    constraints
        .filter((constraint) => String(constraint.constraint_type || '').trim().toLowerCase() === 'room_restriction')
        .forEach((constraint) => {
            const ruleDetails = constraint.rule_details || {};
            const roomCode = String(ruleDetails.room || '').trim();
            if (!roomCode) return;

            entries.push({
                id: constraint.id,
                sourceType: 'constraint',
                sourceConstraintId: constraint.id,
                constraintType: constraint.constraint_type,
                enabled: constraint.enabled !== false,
                type: 'room-assignment',
                room: roomCode,
                roomName: roomCode,
                reason: constraint.description || ruleDetails.message || '',
                allowedCourses: ensureArray(ruleDetails.allowed_courses),
                preferredCourses: ensureArray(ruleDetails.preferred_courses),
                overflowCourses: ensureArray(ruleDetails.overflow_courses),
                ruleDetails
            });
        });

    return entries.sort((left, right) => left.room.localeCompare(right.room));
}

function buildFacultyPreferencesState(facultyRows = [], preferenceRows = []) {
    const preferenceByFacultyId = new Map(
        preferenceRows
            .filter((row) => row?.faculty_id)
            .map((row) => [row.faculty_id, row])
    );

    return facultyRows
        .filter((faculty) => preferenceByFacultyId.has(faculty.id))
        .map((faculty) => {
            const row = preferenceByFacultyId.get(faculty.id);

            return {
                id: row.id || `faculty-pref-${faculty.id}`,
                facultyId: faculty.id,
                faculty: faculty.name,
                timePreferences: {
                    preferred: ensureArray(row.time_preferred),
                    blocked: ensureArray(row.time_blocked)
                },
                dayPreferences: {
                    preferred: ensureArray(row.day_preferred),
                    blocked: ensureArray(row.day_blocked)
                },
                campusAssignment: row.campus_assignment || 'any',
                qualifiedCourses: ensureArray(row.qualified_courses),
                notes: row.notes || ''
            };
        })
        .sort((left, right) => left.faculty.localeCompare(right.faculty));
}

function getCaseByCaseState(courses = []) {
    const entries = courses
        .filter((course) => course.is_case_by_case)
        .map((course) => ({
            id: course.id,
            courseId: course.id,
            code: course.code,
            title: course.title
        }))
        .sort((left, right) => left.code.localeCompare(right.code));

    const descriptions = entries.reduce((accumulator, entry) => {
        accumulator[entry.code] = entry.title || '';
        return accumulator;
    }, {});

    return {
        courses: entries.map((entry) => entry.code),
        descriptions,
        entries
    };
}

function buildDashboardRulesFromCanonicalData({
    courses = [],
    faculty = [],
    rooms = [],
    constraints = [],
    facultyPreferences = []
} = {}) {
    return {
        courseConstraints: getCourseConstraintEntries(courses),
        facultyConstraints: getFacultyConstraintEntries(constraints),
        facultyPreferences: buildFacultyPreferencesState(faculty, facultyPreferences),
        roomConstraints: getRoomConstraintEntries(rooms, constraints),
        caseByCase: getCaseByCaseState(courses)
    };
}

async function loadFallbackDashboardData() {
    const [rulesResponse, facultyResponse, coursesResponse] = await Promise.all([
        fetch('../data/scheduling-rules.json'),
        fetch('../workload-data.json'),
        fetch('../data/course-catalog.json')
    ]);

    if (!rulesResponse.ok) {
        throw new Error('Failed to load scheduling rules fallback');
    }

    const fallbackRules = await rulesResponse.json();
    const fallbackFaculty = facultyResponse.ok ? await facultyResponse.json() : {};
    const fallbackCourses = coursesResponse.ok ? await coursesResponse.json() : {};

    facultyList = Object.keys(fallbackFaculty.facultyWorkload || {}).sort();
    courseList = ensureArray(fallbackCourses.courses).map((course) => course.code).sort();

    const fallbackFacultyConstraints = ensureArray(fallbackRules.facultyConstraints).map((constraint) => ({
        id: constraint.id,
        sourceConstraintId: null,
        constraintType: constraint.rule === 'minimum-instructors-evening' ? 'evening_safety' : 'campus_transition',
        enabled: constraint.enabled !== false,
        editable: false,
        type: constraint.type || 'readonly',
        rule: constraint.rule,
        title: constraint.rule === 'minimum-instructors-evening' ? 'Evening Safety Pairing' : 'Campus Travel Buffer',
        details: constraint.reason || '',
        bufferMinutes: constraint.bufferMinutes || 30,
        minimumCount: constraint.minimumCount || 2,
        afterTime: constraint.afterTime || '16:00',
        ruleDetails: {}
    }));

    const fallbackRoomConstraints = ensureArray(fallbackRules.roomConstraints).map((constraint) => ({
        id: constraint.id,
        sourceType: constraint.type === 'exclude-from-grid' ? 'room' : 'constraint',
        sourceRoomId: null,
        sourceConstraintId: null,
        constraintType: 'room_restriction',
        enabled: constraint.enabled !== false,
        type: constraint.type,
        room: constraint.room,
        roomName: constraint.room,
        reason: constraint.reason || '',
        allowedCourses: ensureArray(constraint.allowedCourses),
        preferredCourses: ensureArray(constraint.preferredCourses),
        overflowCourses: ensureArray(constraint.overflowCourses),
        ruleDetails: {}
    }));

    const fallbackCourseConstraints = ensureArray(fallbackRules.courseConstraints).map((constraint) => ({
        id: constraint.id,
        courseId: null,
        code: constraint.pattern || ensureArray(constraint.courses).join(', '),
        title: '',
        allowedCampus: constraint.roomRestriction?.campus || '',
        allowedRooms: ensureArray(constraint.roomRestriction?.allowedRooms),
        preferredTimes: DEFAULT_TIME_SLOTS,
        preferredDays: DEFAULT_DAY_PATTERNS,
        roomConstraintHard: true,
        timeConstraintHard: ensureArray(constraint.timeRestriction?.blockedSlots).length > 0
    }));

    rules = {
        ...createEmptyRules(),
        ...fallbackRules,
        courseConstraints: fallbackCourseConstraints,
        facultyConstraints: fallbackFacultyConstraints,
        roomConstraints: fallbackRoomConstraints,
        caseByCase: {
            courses: ensureArray(fallbackRules.caseByCase?.courses),
            descriptions: fallbackRules.caseByCase?.descriptions || {},
            entries: ensureArray(fallbackRules.caseByCase?.courses).map((code) => ({
                id: code,
                courseId: null,
                code,
                title: fallbackRules.caseByCase?.descriptions?.[code] || ''
            }))
        }
    };

    runtimeDataSources = {};
    setRuntimeDataSourceStatus('constraints', {
        label: 'Constraints',
        source: 'local-file',
        canonical: false,
        fallback: true,
        detail: '../data/scheduling-rules.json',
        message: 'Constraints dashboard is using the local scheduling rules fallback.'
    });
    setRuntimeDataSourceStatus('faculty', {
        label: 'Faculty',
        source: 'local-file',
        canonical: false,
        fallback: true,
        detail: '../workload-data.json',
        message: 'Faculty names are using workload JSON fallback.'
    });
    setRuntimeDataSourceStatus('courses', {
        label: 'Courses',
        source: 'local-file',
        canonical: false,
        fallback: true,
        detail: '../data/course-catalog.json',
        message: 'Course metadata is using the local catalog fallback.'
    });

    currentMode = 'fallback';
}

async function loadCanonicalDashboardData() {
    runtimeDataSources = {};

    const [facultyData, coursesData, roomsData, constraintsData] = await Promise.all([
        dbService.getFaculty(),
        dbService.getCourses(),
        dbService.getRooms(),
        dbService.getConstraints()
    ]);

    facultyRecords = facultyData || [];
    courseRecords = coursesData || [];
    roomRecords = roomsData || [];
    constraintRecords = constraintsData || [];

    facultyList = facultyRecords.map((faculty) => faculty.name).sort();
    courseList = courseRecords.map((course) => course.code).sort();

    facultyPreferenceRows = await dbService.listFacultyPreferences(
        facultyRecords.map((faculty) => faculty.id)
    );

    rules = buildDashboardRulesFromCanonicalData({
        courses: courseRecords,
        faculty: facultyRecords,
        rooms: roomRecords,
        constraints: constraintRecords,
        facultyPreferences: facultyPreferenceRows
    });

    syncRuntimeDataSourcesFromDbService();
    currentMode = 'canonical';
}

function populateFacultyDropdown(selectedValue = 'all') {
    const dropdown = document.getElementById('facultyDropdown');
    if (!dropdown) return;

    const facultyWithPrefs = new Set((rules.facultyPreferences || []).map((pref) => pref.faculty));
    const orderedFaculty = [...facultyList].sort((left, right) => {
        const leftHasPrefs = facultyWithPrefs.has(left) ? 0 : 1;
        const rightHasPrefs = facultyWithPrefs.has(right) ? 0 : 1;
        return leftHasPrefs - rightHasPrefs || left.localeCompare(right);
    });

    dropdown.innerHTML = `
        <option value="all">All Faculty</option>
        ${orderedFaculty.map((faculty) => `<option value="${escapeHtml(faculty)}">${escapeHtml(faculty)}</option>`).join('')}
    `;

    if (orderedFaculty.includes(selectedValue) || selectedValue === 'all') {
        dropdown.value = selectedValue;
    }
}

function renderCourseConstraints() {
    const container = document.getElementById('courseConstraintsList');
    const constraints = rules?.courseConstraints || [];

    if (!container) return;

    if (constraints.length === 0) {
        container.innerHTML = '<p class="empty-state">No course-specific constraints are currently stored in the canonical course catalog.</p>';
        return;
    }

    container.innerHTML = constraints.map((constraint) => {
        const tags = [];

        if (constraint.allowedRooms?.length) {
            tags.push(`<span class="tag room">Rooms: ${escapeHtml(constraint.allowedRooms.join(', '))}</span>`);
        }
        if (constraint.allowedCampus) {
            tags.push(`<span class="tag campus">${escapeHtml(formatCampusLabel(constraint.allowedCampus))}</span>`);
        }
        if (!sameStringArray(constraint.preferredTimes || DEFAULT_TIME_SLOTS, DEFAULT_TIME_SLOTS)) {
            tags.push(`<span class="tag time">Times: ${escapeHtml((constraint.preferredTimes || []).join(', '))}</span>`);
        }
        if (!sameStringArray(constraint.preferredDays || DEFAULT_DAY_PATTERNS, DEFAULT_DAY_PATTERNS)) {
            tags.push(`<span class="tag campus">Days: ${escapeHtml((constraint.preferredDays || []).join(', '))}</span>`);
        }
        if (constraint.roomConstraintHard) {
            tags.push('<span class="tag safety">Hard room rule</span>');
        }
        if (constraint.timeConstraintHard) {
            tags.push('<span class="tag safety">Hard time rule</span>');
        }

        return `
            <div class="constraint-card" data-id="${escapeHtml(constraint.id)}">
                <div class="constraint-content">
                    <div class="constraint-title">${escapeHtml(constraint.code)}${constraint.title ? ` - ${escapeHtml(constraint.title)}` : ''}</div>
                    <div class="constraint-details">Managed in the canonical course catalog.</div>
                    <div class="constraint-tags">${tags.join('')}</div>
                </div>
                <div class="constraint-actions">
                    <button class="btn-icon" onclick="editCourseConstraint('${escapeHtml(constraint.courseId)}')" title="Open in Course Catalog">
                        &#9998;
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderFacultyConstraints() {
    const container = document.getElementById('facultyConstraintsList');
    const constraints = rules?.facultyConstraints || [];

    if (!container) return;

    if (constraints.length === 0) {
        container.innerHTML = '<p class="empty-state">No faculty constraints defined.</p>';
        return;
    }

    container.innerHTML = constraints.map((constraint) => {
        const tags = [];

        if (constraint.type === 'travel-time') {
            tags.push(`<span class="tag campus">Travel buffer: ${escapeHtml(constraint.bufferMinutes)} min</span>`);
        }
        if (constraint.type === 'safety') {
            tags.push(`<span class="tag safety">Min ${escapeHtml(constraint.minimumCount)} after ${escapeHtml(constraint.afterTime)}</span>`);
        }
        if (constraint.type === 'readonly') {
            tags.push(`<span class="tag room">${escapeHtml(constraint.constraintType)}</span>`);
        }

        return `
            <div class="constraint-card ${constraint.enabled ? '' : 'disabled'}" data-id="${escapeHtml(constraint.id)}">
                <div class="constraint-toggle">
                    <input type="checkbox" ${constraint.enabled ? 'checked' : ''}
                           onchange="toggleFacultyConstraint('${escapeHtml(constraint.id)}', this.checked)">
                </div>
                <div class="constraint-content">
                    <div class="constraint-title">${escapeHtml(constraint.title)}</div>
                    <div class="constraint-details">${escapeHtml(constraint.details || '')}</div>
                    <div class="constraint-tags">${tags.join('')}</div>
                </div>
                <div class="constraint-actions">
                    ${constraint.editable ? `
                        <button class="btn-icon" onclick="editFacultyConstraint('${escapeHtml(constraint.id)}')" title="Edit">
                            &#9998;
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function renderFacultyPreferences() {
    const container = document.getElementById('facultyPreferencesList');
    const preferences = rules?.facultyPreferences || [];
    const filter = document.getElementById('facultyDropdown')?.value || 'all';

    if (!container) return;

    const filtered = filter === 'all'
        ? preferences
        : preferences.filter((pref) => pref.faculty === filter);

    if (filtered.length === 0) {
        container.innerHTML = '<p class="empty-state">No faculty preferences stored yet. Add one to persist scheduling guidance in the database.</p>';
        return;
    }

    container.innerHTML = filtered.map((pref) => {
        const timeTags = [];
        if (pref.timePreferences?.preferred?.length > 0) {
            timeTags.push(`<span class="tag time">Prefers: ${escapeHtml(pref.timePreferences.preferred.join(', '))}</span>`);
        }
        if (pref.timePreferences?.blocked?.length > 0) {
            timeTags.push(`<span class="tag safety">Avoids: ${escapeHtml(pref.timePreferences.blocked.join(', '))}</span>`);
        }

        const dayTags = [];
        if (pref.dayPreferences?.preferred?.length > 0) {
            dayTags.push(`<span class="tag campus">Days: ${escapeHtml(pref.dayPreferences.preferred.join(', '))}</span>`);
        }
        if (pref.dayPreferences?.blocked?.length > 0) {
            dayTags.push(`<span class="tag safety">Not: ${escapeHtml(pref.dayPreferences.blocked.join(', '))}</span>`);
        }

        const campusTag = pref.campusAssignment && pref.campusAssignment !== 'any'
            ? `<span class="tag room">Campus: ${escapeHtml(formatCampusLabel(pref.campusAssignment))}</span>`
            : '<span class="tag room">Campus: Any</span>';

        return `
            <div class="faculty-pref-card" data-id="${escapeHtml(pref.id)}">
                <div class="faculty-pref-header">
                    <div>
                        <div class="faculty-pref-name">${escapeHtml(pref.faculty)}</div>
                        ${pref.notes ? `<div style="font-size: 12px; color: #6b7280; margin-top: 2px;">${escapeHtml(pref.notes)}</div>` : ''}
                    </div>
                    <div class="constraint-actions">
                        <button class="btn-icon" onclick="editFacultyPreference('${escapeHtml(pref.id)}')" title="Edit">
                            &#9998;
                        </button>
                        <button class="btn-icon delete" onclick="deleteFacultyPreference('${escapeHtml(pref.id)}')" title="Delete">
                            &#10005;
                        </button>
                    </div>
                </div>
                <div class="faculty-pref-grid">
                    <div class="pref-item">
                        <div class="pref-item-label">Time Preferences</div>
                        <div class="pref-item-value">${timeTags.length > 0 ? timeTags.join(' ') : '<span style="color: #9ca3af;">No preference</span>'}</div>
                    </div>
                    <div class="pref-item">
                        <div class="pref-item-label">Day Preferences</div>
                        <div class="pref-item-value">${dayTags.length > 0 ? dayTags.join(' ') : '<span style="color: #9ca3af;">No preference</span>'}</div>
                    </div>
                    <div class="pref-item">
                        <div class="pref-item-label">Campus</div>
                        <div class="pref-item-value">${campusTag}</div>
                    </div>
                    <div class="pref-item">
                        <div class="pref-item-label">Qualified Courses</div>
                        <div class="pref-item-value">
                            ${pref.qualifiedCourses?.length > 0
                                ? pref.qualifiedCourses.map((course) => `<span class="tag" style="background: #f3e8ff; color: #7c3aed;">${escapeHtml(course)}</span>`).join(' ')
                                : '<span style="color: #9ca3af;">All courses</span>'}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderRoomConstraints() {
    const container = document.getElementById('roomConstraintsList');
    const constraints = rules?.roomConstraints || [];

    if (!container) return;

    if (constraints.length === 0) {
        container.innerHTML = '<p class="empty-state">No room constraints defined.</p>';
        return;
    }

    container.innerHTML = constraints.map((constraint) => {
        const tags = [];

        if (constraint.type === 'exclude-from-grid') {
            tags.push('<span class="tag room">Excluded from grid</span>');
        }
        if (constraint.allowedCourses?.length) {
            tags.push(`<span class="tag room">Allowed: ${escapeHtml(constraint.allowedCourses.join(', '))}</span>`);
        }
        if (constraint.preferredCourses?.length) {
            tags.push(`<span class="tag campus">Preferred: ${escapeHtml(constraint.preferredCourses.join(', '))}</span>`);
        }
        if (constraint.overflowCourses?.length) {
            tags.push(`<span class="tag time">Overflow: ${escapeHtml(constraint.overflowCourses.join(', '))}</span>`);
        }

        return `
            <div class="constraint-card ${constraint.enabled === false ? 'disabled' : ''}" data-id="${escapeHtml(constraint.id)}">
                <div class="constraint-content" style="margin-left: 30px;">
                    <div class="constraint-title">Room ${escapeHtml(constraint.room)}</div>
                    <div class="constraint-details">${escapeHtml(constraint.reason || '')}</div>
                    <div class="constraint-tags">${tags.join('')}</div>
                </div>
                <div class="constraint-actions">
                    <button class="btn-icon" onclick="editRoomConstraint('${escapeHtml(constraint.id)}')" title="Edit">
                        &#9998;
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderCaseByeCaseCourses() {
    const container = document.getElementById('caseByeCaseList');
    const entries = rules?.caseByCase?.entries || [];

    if (!container) return;

    if (entries.length === 0) {
        container.innerHTML = '<p class="empty-state">No case-by-case courses are marked in the canonical course catalog.</p>';
        return;
    }

    container.innerHTML = entries.map((entry) => `
        <div class="case-course">
            <span class="case-course-code">${escapeHtml(entry.code)}</span>
            <span class="case-course-desc">${escapeHtml(entry.title || '')}</span>
            <button class="btn-icon" onclick="manageCaseByCaseCourse('${escapeHtml(entry.courseId)}')" title="Open in Course Catalog">
                &#9998;
            </button>
        </div>
    `).join('');
}

function renderAllSections(options = {}) {
    const previousFilter = options.preserveFacultyFilter
        ? (document.getElementById('facultyDropdown')?.value || 'all')
        : 'all';

    populateFacultyDropdown(previousFilter);
    renderCourseConstraints();
    renderFacultyConstraints();
    renderFacultyPreferences();
    renderRoomConstraints();
    renderCaseByeCaseCourses();
    renderRuntimeDataSourceBanner();
}

async function refreshDashboardData(options = {}) {
    const { quiet = false, preserveFacultyFilter = true } = options;

    setStatusText('Refreshing constraint sources...');

    try {
        const canUseCanonicalData = typeof dbService !== 'undefined' &&
            typeof isSupabaseConfigured === 'function' &&
            isSupabaseConfigured();

        if (canUseCanonicalData) {
            await loadCanonicalDashboardData();
            renderAllSections({ preserveFacultyFilter });
            setStatusText('Connected to canonical constraint data');
            if (!quiet) showToast('Constraint data refreshed from Supabase');
            return;
        }

        await loadFallbackDashboardData();
        renderAllSections({ preserveFacultyFilter });
        setStatusText('Read-only fallback mode', 'warning');
        if (!quiet) showToast('Loaded fallback constraint data', 'error');
    } catch (error) {
        console.error('Failed to refresh constraints dashboard:', error);

        try {
            await loadFallbackDashboardData();
            renderAllSections({ preserveFacultyFilter });
            setStatusText('Database load failed; showing fallback data', 'warning');
            showToast(`Using fallback data: ${error.message}`, 'error');
        } catch (fallbackError) {
            console.error('Failed to load fallback dashboard data:', fallbackError);
            setStatusText('Unable to load constraint data', 'warning');
            showToast(`Error loading constraints: ${fallbackError.message}`, 'error');
        }
    }
}

function filterFacultyPreferences() {
    renderFacultyPreferences();
}

function openCourseCatalog(courseId = null, action = null) {
    const params = new URLSearchParams();
    if (courseId) params.set('courseId', courseId);
    if (action) params.set('action', action);

    const suffix = params.toString() ? `?${params.toString()}` : '';
    window.location.href = `course-management.html${suffix}`;
}

function showAddCourseConstraint() {
    openCourseCatalog(null, 'add');
}

function editCourseConstraint(courseId) {
    openCourseCatalog(courseId);
}

function showAddCaseByCase() {
    openCourseCatalog(null, 'add');
}

function manageCaseByCaseCourse(courseId) {
    openCourseCatalog(courseId);
}

function getFacultyPreferenceById(id) {
    return (rules.facultyPreferences || []).find((pref) => pref.id === id) || null;
}

function getFacultyConstraintById(id) {
    return (rules.facultyConstraints || []).find((constraint) => constraint.id === id) || null;
}

function getRoomConstraintById(id) {
    return (rules.roomConstraints || []).find((constraint) => constraint.id === id) || null;
}

function assertCanonicalEditing() {
    if (currentMode === 'canonical') {
        return true;
    }

    showToast('Editing is unavailable in fallback mode. Connect the page to Supabase to make canonical changes.', 'error');
    return false;
}

function showAddFacultyPreference() {
    if (!assertCanonicalEditing()) return;

    const existingFacultyIds = new Set((rules.facultyPreferences || []).map((pref) => pref.facultyId));
    const availableFaculty = facultyRecords.filter((faculty) => !existingFacultyIds.has(faculty.id));

    if (availableFaculty.length === 0) {
        showToast('Every faculty member already has a stored preference row.', 'error');
        return;
    }

    editingConstraint = { type: 'faculty-pref', facultyId: null };
    document.getElementById('modalTitle').textContent = 'Add Faculty Preferences';
    document.getElementById('modalBody').innerHTML = buildFacultyPreferenceModal({
        facultyOptions: availableFaculty
    });
    document.getElementById('modalOverlay').style.display = 'flex';
}

function editFacultyPreference(id) {
    if (!assertCanonicalEditing()) return;

    const pref = getFacultyPreferenceById(id);
    if (!pref) return;

    editingConstraint = { type: 'faculty-pref', id, facultyId: pref.facultyId };
    document.getElementById('modalTitle').textContent = 'Edit Faculty Preferences';
    document.getElementById('modalBody').innerHTML = buildFacultyPreferenceModal({
        pref,
        facultyOptions: []
    });
    document.getElementById('modalOverlay').style.display = 'flex';
}

function buildFacultyPreferenceModal({ pref = null, facultyOptions = [] } = {}) {
    const readOnlyFaculty = Boolean(pref);

    return `
        <div class="form-group">
            <label>Faculty Member</label>
            ${readOnlyFaculty ? `
                <input type="text" id="prefFacultyName" value="${escapeHtml(pref.faculty)}" readonly style="background: #f3f4f6;">
            ` : `
                <select id="prefFacultyId">
                    <option value="">Select faculty...</option>
                    ${facultyOptions.map((faculty) => `<option value="${escapeHtml(faculty.id)}">${escapeHtml(faculty.name)}</option>`).join('')}
                </select>
            `}
        </div>
        <div class="form-group">
            <label>Preferred Time Slots</label>
            <div class="checkbox-group">
                ${DEFAULT_TIME_SLOTS.map((slot) => `
                    <div class="checkbox-item">
                        <input type="checkbox" id="pref-time-${slot}" value="${slot}"
                               ${pref?.timePreferences?.preferred?.includes(slot) ? 'checked' : ''}>
                        <label for="pref-time-${slot}">${escapeHtml(slot.charAt(0).toUpperCase() + slot.slice(1))}</label>
                    </div>
                `).join('')}
            </div>
        </div>
        <div class="form-group">
            <label>Blocked Time Slots</label>
            <div class="checkbox-group">
                ${DEFAULT_TIME_SLOTS.map((slot) => `
                    <div class="checkbox-item">
                        <input type="checkbox" id="blocked-time-${slot}" value="${slot}"
                               ${pref?.timePreferences?.blocked?.includes(slot) ? 'checked' : ''}>
                        <label for="blocked-time-${slot}">${escapeHtml(slot.charAt(0).toUpperCase() + slot.slice(1))}</label>
                    </div>
                `).join('')}
            </div>
        </div>
        <div class="form-group">
            <label>Preferred Days</label>
            <div class="checkbox-group">
                ${DEFAULT_DAY_PATTERNS.map((day) => `
                    <div class="checkbox-item">
                        <input type="checkbox" id="pref-day-${day}" value="${day}"
                               ${pref?.dayPreferences?.preferred?.includes(day) ? 'checked' : ''}>
                        <label for="pref-day-${day}">${escapeHtml(day)}</label>
                    </div>
                `).join('')}
            </div>
        </div>
        <div class="form-group">
            <label>Blocked Days</label>
            <div class="checkbox-group">
                ${DEFAULT_DAY_PATTERNS.map((day) => `
                    <div class="checkbox-item">
                        <input type="checkbox" id="blocked-day-${day}" value="${day}"
                               ${pref?.dayPreferences?.blocked?.includes(day) ? 'checked' : ''}>
                        <label for="blocked-day-${day}">${escapeHtml(day)}</label>
                    </div>
                `).join('')}
            </div>
        </div>
        <div class="form-group">
            <label>Campus Assignment</label>
            <select id="prefCampus">
                <option value="any" ${pref?.campusAssignment === 'any' || !pref ? 'selected' : ''}>Any Campus</option>
                <option value="cheney" ${pref?.campusAssignment === 'cheney' ? 'selected' : ''}>Cheney Only</option>
                <option value="catalyst" ${pref?.campusAssignment === 'catalyst' ? 'selected' : ''}>Catalyst Only</option>
            </select>
        </div>
        <div class="form-group">
            <label>Qualified Courses (leave empty for all courses)</label>
            <div class="checkbox-group" style="max-height: 200px; overflow-y: auto; padding: 8px; background: #f9fafb; border-radius: 6px;">
                ${courseList.map((course) => `
                    <div class="checkbox-item">
                        <input type="checkbox" id="qual-course-${escapeHtml(course.replace(/\s/g, '-'))}" value="${escapeHtml(course)}"
                               ${pref?.qualifiedCourses?.includes(course) ? 'checked' : ''}>
                        <label for="qual-course-${escapeHtml(course.replace(/\s/g, '-'))}">${escapeHtml(course)}</label>
                    </div>
                `).join('')}
            </div>
        </div>
        <div class="form-group">
            <label>Notes</label>
            <textarea id="prefNotes" placeholder="Optional notes about this faculty member">${escapeHtml(pref?.notes || '')}</textarea>
        </div>
    `;
}

async function saveFacultyPreference() {
    if (!assertCanonicalEditing()) return;

    const facultyId = editingConstraint?.facultyId || document.getElementById('prefFacultyId')?.value;
    const facultyRecord = facultyRecords.find((faculty) => faculty.id === facultyId);

    if (!facultyId || !facultyRecord) {
        showToast('Please choose a faculty member from the canonical faculty list.', 'error');
        return;
    }

    const preferredTimes = DEFAULT_TIME_SLOTS.filter((slot) => document.getElementById(`pref-time-${slot}`)?.checked);
    const blockedTimes = DEFAULT_TIME_SLOTS.filter((slot) => document.getElementById(`blocked-time-${slot}`)?.checked);
    const preferredDays = DEFAULT_DAY_PATTERNS.filter((day) => document.getElementById(`pref-day-${day}`)?.checked);
    const blockedDays = DEFAULT_DAY_PATTERNS.filter((day) => document.getElementById(`blocked-day-${day}`)?.checked);
    const campusAssignment = document.getElementById('prefCampus')?.value || 'any';
    const qualifiedCourses = courseList.filter((course) => document.getElementById(`qual-course-${course.replace(/\s/g, '-')}`)?.checked);
    const notes = document.getElementById('prefNotes')?.value?.trim() || '';

    try {
        await dbService.saveFacultyPreferences(facultyId, {
            timePreferred: preferredTimes,
            timeBlocked: blockedTimes,
            dayPreferred: preferredDays,
            dayBlocked: blockedDays,
            campusAssignment,
            qualifiedCourses,
            notes
        });

        closeModal();
        await refreshDashboardData({ quiet: true, preserveFacultyFilter: true });
        showToast(`Saved preferences for ${facultyRecord.name}`);
    } catch (error) {
        console.error('Failed to save faculty preference:', error);
        showToast(`Failed to save faculty preferences: ${error.message}`, 'error');
    }
}

async function deleteFacultyPreference(id) {
    if (!assertCanonicalEditing()) return;

    const pref = getFacultyPreferenceById(id);
    if (!pref) return;

    if (!confirm(`Remove preferences for ${pref.faculty}?`)) return;

    try {
        await dbService.deleteFacultyPreferences(pref.facultyId);
        await refreshDashboardData({ quiet: true, preserveFacultyFilter: true });
        showToast(`Removed preferences for ${pref.faculty}`);
    } catch (error) {
        console.error('Failed to delete faculty preference:', error);
        showToast(`Failed to delete faculty preferences: ${error.message}`, 'error');
    }
}

async function toggleFacultyConstraint(id, enabled) {
    if (!assertCanonicalEditing()) return;

    const constraint = getFacultyConstraintById(id);
    if (!constraint || !constraint.sourceConstraintId) return;

    try {
        await dbService.saveConstraint({
            id: constraint.sourceConstraintId,
            type: constraint.constraintType,
            description: constraint.details,
            ruleDetails: constraint.ruleDetails,
            enabled
        });

        await refreshDashboardData({ quiet: true, preserveFacultyFilter: true });
        showToast(`Faculty constraint ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
        console.error('Failed to toggle faculty constraint:', error);
        showToast(`Failed to update faculty constraint: ${error.message}`, 'error');
    }
}

function editFacultyConstraint(id) {
    if (!assertCanonicalEditing()) return;

    const constraint = getFacultyConstraintById(id);
    if (!constraint || !constraint.editable) return;

    editingConstraint = { type: 'faculty', id };
    document.getElementById('modalTitle').textContent = 'Edit Faculty Constraint';

    let formHtml = '';
    if (constraint.rule === 'no-back-to-back-different-campus') {
        formHtml = `
            <div class="form-group">
                <label>Travel Buffer (minutes)</label>
                <input type="number" id="bufferMinutes" value="${escapeHtml(constraint.bufferMinutes || 30)}" min="0" step="5">
            </div>
        `;
    } else if (constraint.rule === 'minimum-instructors-evening') {
        formHtml = `
            <div class="form-group">
                <label>Minimum Instructors</label>
                <input type="number" id="minimumCount" value="${escapeHtml(constraint.minimumCount || 2)}" min="1">
            </div>
            <div class="form-group">
                <label>After Time</label>
                <input type="text" id="afterTime" value="${escapeHtml(constraint.afterTime || '16:00')}" placeholder="HH:MM">
            </div>
        `;
    }

    formHtml += `
        <div class="form-group">
            <label>Reason</label>
            <textarea id="constraintReason">${escapeHtml(constraint.details || '')}</textarea>
        </div>
    `;

    document.getElementById('modalBody').innerHTML = formHtml;
    document.getElementById('modalOverlay').style.display = 'flex';
}

async function saveFacultyConstraintEdit() {
    if (!assertCanonicalEditing()) return;

    const constraint = getFacultyConstraintById(editingConstraint?.id);
    if (!constraint) return;

    const updatedRuleDetails = { ...(constraint.ruleDetails || {}) };
    const reason = document.getElementById('constraintReason')?.value?.trim() || constraint.details;

    if (constraint.rule === 'no-back-to-back-different-campus') {
        const bufferMinutes = Number.parseInt(document.getElementById('bufferMinutes')?.value, 10) || 30;
        updatedRuleDetails.travel_buffer_minutes = bufferMinutes;
        updatedRuleDetails.min_gap_hours = Number((bufferMinutes / 60).toFixed(2));
    }

    if (constraint.rule === 'minimum-instructors-evening') {
        updatedRuleDetails.min_instructors = Number.parseInt(document.getElementById('minimumCount')?.value, 10) || 2;
        updatedRuleDetails.time_after = document.getElementById('afterTime')?.value || '16:00';
    }

    try {
        await dbService.saveConstraint({
            id: constraint.sourceConstraintId,
            type: constraint.constraintType,
            description: reason,
            ruleDetails: updatedRuleDetails,
            enabled: constraint.enabled
        });

        closeModal();
        await refreshDashboardData({ quiet: true, preserveFacultyFilter: true });
        showToast('Constraint saved');
    } catch (error) {
        console.error('Failed to save faculty constraint:', error);
        showToast(`Failed to save faculty constraint: ${error.message}`, 'error');
    }
}

function editRoomConstraint(id) {
    if (!assertCanonicalEditing()) return;

    const constraint = getRoomConstraintById(id);
    if (!constraint) return;

    editingConstraint = { type: 'room', id };
    document.getElementById('modalTitle').textContent = `Edit Room ${constraint.room}`;

    if (constraint.type === 'exclude-from-grid') {
        document.getElementById('modalBody').innerHTML = `
            <div class="form-group">
                <label>Room</label>
                <input type="text" value="${escapeHtml(constraint.room)}" readonly style="background: #f3f4f6;">
            </div>
            <div class="form-group">
                <label style="display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="roomExcludeFromGrid" checked>
                    Exclude this room from the scheduling grid
                </label>
            </div>
            <div class="form-group">
                <label>Notes</label>
                <textarea id="roomConstraintReason">${escapeHtml(constraint.reason || '')}</textarea>
            </div>
        `;
    } else {
        document.getElementById('modalBody').innerHTML = `
            <div class="form-group">
                <label>Room</label>
                <input type="text" value="${escapeHtml(constraint.room)}" readonly style="background: #f3f4f6;">
            </div>
            <div class="form-group">
                <label>Allowed Courses</label>
                <input type="text" id="allowedCourses" value="${escapeHtml((constraint.allowedCourses || []).join(', '))}" placeholder="DESN 301, DESN 359">
            </div>
            <div class="form-group">
                <label>Preferred Courses</label>
                <input type="text" id="preferredCourses" value="${escapeHtml((constraint.preferredCourses || []).join(', '))}" placeholder="DESN 326, DESN 336">
            </div>
            <div class="form-group">
                <label>Overflow Courses</label>
                <input type="text" id="overflowCourses" value="${escapeHtml((constraint.overflowCourses || []).join(', '))}" placeholder="DESN 100, DESN 200">
            </div>
            <div class="form-group">
                <label>Reason</label>
                <textarea id="roomConstraintReason">${escapeHtml(constraint.reason || '')}</textarea>
            </div>
            <div class="form-group">
                <label style="display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="roomConstraintEnabled" ${constraint.enabled ? 'checked' : ''}>
                    Constraint enabled
                </label>
            </div>
        `;
    }

    document.getElementById('modalOverlay').style.display = 'flex';
}

function parseCsvList(value) {
    return String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

async function saveRoomConstraint() {
    if (!assertCanonicalEditing()) return;

    const constraint = getRoomConstraintById(editingConstraint?.id);
    if (!constraint) return;

    try {
        if (constraint.sourceType === 'room') {
            const excludeFromGrid = Boolean(document.getElementById('roomExcludeFromGrid')?.checked);
            await dbService.updateRoom(constraint.sourceRoomId, {
                excludeFromGrid
            });
        } else {
            const allowedCourses = parseCsvList(document.getElementById('allowedCourses')?.value);
            const preferredCourses = parseCsvList(document.getElementById('preferredCourses')?.value);
            const overflowCourses = parseCsvList(document.getElementById('overflowCourses')?.value);
            const reason = document.getElementById('roomConstraintReason')?.value?.trim() || constraint.reason || '';
            const enabled = Boolean(document.getElementById('roomConstraintEnabled')?.checked);

            await dbService.saveConstraint({
                id: constraint.sourceConstraintId,
                type: constraint.constraintType || 'room_restriction',
                description: reason,
                ruleDetails: {
                    ...(constraint.ruleDetails || {}),
                    room: constraint.room,
                    allowed_courses: allowedCourses,
                    preferred_courses: preferredCourses,
                    overflow_courses: overflowCourses
                },
                enabled
            });
        }

        closeModal();
        await refreshDashboardData({ quiet: true, preserveFacultyFilter: true });
        showToast('Room constraint saved');
    } catch (error) {
        console.error('Failed to save room constraint:', error);
        showToast(`Failed to save room constraint: ${error.message}`, 'error');
    }
}

function saveConstraint() {
    if (editingConstraint?.type === 'faculty') {
        saveFacultyConstraintEdit();
        return;
    }

    if (editingConstraint?.type === 'faculty-pref') {
        saveFacultyPreference();
        return;
    }

    if (editingConstraint?.type === 'room') {
        saveRoomConstraint();
    }
}

function runValidation() {
    const results = [];
    const courseConstraints = rules.courseConstraints || [];
    const caseByCaseCourses = new Set(rules.caseByCase?.courses || []);

    const roomConstrainedCourses = courseConstraints.filter((constraint) => (constraint.allowedRooms || []).length > 0);
    roomConstrainedCourses.forEach((constraint) => {
        if (caseByCaseCourses.has(constraint.code)) {
            results.push({
                type: 'warning',
                message: `${constraint.code} is case-by-case and still has course catalog scheduling constraints. Verify that both are intentional.`
            });
        }
    });

    const duplicateRoomRules = new Map();
    (rules.roomConstraints || []).forEach((constraint) => {
        const list = duplicateRoomRules.get(constraint.room) || [];
        list.push(constraint);
        duplicateRoomRules.set(constraint.room, list);
    });

    duplicateRoomRules.forEach((entries, room) => {
        if (entries.length > 1) {
            results.push({
                type: 'warning',
                message: `${room} has ${entries.length} room-level rules. Confirm they are not duplicating each other.`
            });
        }
    });

    const container = document.getElementById('validationResults');
    if (!container) return;

    if (results.length === 0) {
        container.innerHTML = `
            <div class="validation-success">
                <span class="icon">&#10003;</span>
                <span>No obvious rule conflicts detected in the current canonical data.</span>
            </div>
        `;
    } else {
        container.innerHTML = results.map((result) => `
            <div class="validation-${result.type}">
                <span class="icon">${result.type === 'error' ? '&#10007;' : '&#9888;'}</span>
                <span>${escapeHtml(result.message)}</span>
            </div>
        `).join('');
    }

    showToast(`Validation complete: ${results.length} issue(s) found`);
}

function saveRules() {
    if (currentMode === 'canonical') {
        showToast('Changes save directly to the canonical database on this page.', 'success');
        return;
    }

    showToast('This build no longer supports exporting local JSON from the constraints dashboard.', 'error');
}

function resetToDefaults() {
    refreshDashboardData();
}

function closeModal() {
    document.getElementById('modalOverlay').style.display = 'none';
    editingConstraint = null;
}

document.getElementById('modalOverlay')?.addEventListener('click', function(event) {
    if (event.target === this) {
        closeModal();
    }
});

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    if (!toast || !toastMessage) return;

    toastMessage.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('visible');

    setTimeout(() => {
        toast.classList.remove('visible');
    }, 3000);
}

window.addEventListener('beforeunload', function(event) {
    if (currentMode !== 'canonical') return;
    if (document.getElementById('modalOverlay')?.style.display === 'flex') {
        event.preventDefault();
        event.returnValue = '';
    }
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        buildDashboardRulesFromCanonicalData,
        getCourseConstraintEntries,
        getFacultyConstraintEntries,
        getRoomConstraintEntries,
        getCaseByCaseState,
        __setRuntimeDataSourcesForTests(nextState) {
            runtimeDataSources = { ...(nextState || {}) };
            renderRuntimeDataSourceBanner();
        },
        __getRuntimeDataSourceSummaryForTests() {
            return getRuntimeDataSourceSummary();
        }
    };
}
