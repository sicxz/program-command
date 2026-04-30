(function(root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(root);
        return;
    }

    const api = factory(root);
    root.PublicSchedulePage = api;
    if (root.document) {
        root.document.addEventListener('DOMContentLoaded', () => {
            api.createPublicScheduleApp().init();
        });
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
    'use strict';

    const DEFAULTS = Object.freeze({
        year: '2026-27',
        quarter: 'fall',
        programCode: 'ewu-design'
    });

    const QUARTERS = Object.freeze(['fall', 'winter', 'spring']);
    const QUARTER_LABELS = Object.freeze({
        fall: 'Fall',
        winter: 'Winter',
        spring: 'Spring'
    });
    const DAY_PATTERNS = Object.freeze([
        { id: 'MW', label: 'Monday / Wednesday' },
        { id: 'TR', label: 'Tuesday / Thursday' }
    ]);
    const TIME_SLOTS = Object.freeze(['10:00-12:20', '13:00-15:20', '16:00-18:20']);
    const ROOM_ORDER = Object.freeze(['206', '207', '209', '210', '212', 'CEB 102', 'CEB 104']);
    const ROOM_LABELS = Object.freeze({
        '206': '206 UX Lab',
        '207': '207 Media Lab',
        '209': '209 Mac Lab',
        '210': '210 Mac Lab',
        '212': '212 Project Lab',
        'CEB 102': 'CEB 102',
        'CEB 104': 'CEB 104'
    });

    function resolveScheduleDataUtils(options) {
        return options.scheduleDataUtils
            || root.ScheduleDataUtils
            || {};
    }

    function resolveDocument(options) {
        return options.document || root.document || null;
    }

    function normalizeCourseCode(value) {
        return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
    }

    function formatClock(value) {
        const [hourText, minuteText] = String(value || '').split(':');
        const hour = Number(hourText);
        const minute = Number(minuteText);
        if (!Number.isFinite(hour) || !Number.isFinite(minute)) return String(value || '').trim();
        const suffix = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
    }

    function formatTimeSlot(value) {
        const [start, end] = String(value || '').split('-');
        if (!start || !end) return String(value || '').trim();
        return `${formatClock(start)} - ${formatClock(end)}`;
    }

    function getDisplayYear(year, quarter) {
        const [startYearText] = String(year || DEFAULTS.year).split('-');
        const startYear = Number(startYearText);
        if (!Number.isFinite(startYear)) return '';
        return quarter === 'fall' ? String(startYear) : String(startYear + 1);
    }

    function formatQuarterTitle(year, quarter) {
        const quarterKey = String(quarter || DEFAULTS.quarter).toLowerCase();
        return `${QUARTER_LABELS[quarterKey] || quarterKey} ${getDisplayYear(year, quarterKey)}`;
    }

    function normalizePublicScheduleRows(rows) {
        return (Array.isArray(rows) ? rows : []).map((row) => ({
            quarter: row.quarter,
            day_pattern: row.day_pattern,
            time_slot: row.time_slot,
            section: row.section,
            projected_enrollment: row.projected_enrollment,
            course: {
                code: row.course_code,
                title: row.course_title,
                default_credits: row.credits
            },
            faculty: {
                name: row.instructor_name
            },
            room: {
                room_code: row.room_code
            }
        }));
    }

    function createEmptySchedule(utils) {
        if (typeof utils.createEmptyAcademicYearScheduleData === 'function') {
            return utils.createEmptyAcademicYearScheduleData({
                quarters: QUARTERS,
                dayPatterns: DAY_PATTERNS.map((day) => day.id)
            });
        }

        return QUARTERS.reduce((schedule, quarter) => {
            schedule[quarter] = {
                ONLINE: { async: [] },
                ARRANGED: { arranged: [] },
                MW: {},
                TR: {}
            };
            return schedule;
        }, {});
    }

    function buildScheduleFromPublicRows(rows, options = {}) {
        const utils = resolveScheduleDataUtils(options);
        const normalizedRows = normalizePublicScheduleRows(rows);

        if (typeof utils.buildScheduleDataFromDatabaseRecords === 'function') {
            return utils.buildScheduleDataFromDatabaseRecords(normalizedRows, {
                quarters: QUARTERS,
                dayPatterns: DAY_PATTERNS.map((day) => day.id),
                normalizeCourseCode,
                normalizeInstructor: (value) => String(value || '').trim() || 'TBD',
                normalizeRoom: (value) => String(value || '').trim()
            });
        }

        return createEmptySchedule(utils);
    }

    function getQuarterCourses(scheduleData, quarter, utils) {
        const quarterData = scheduleData && scheduleData[quarter];
        if (!quarterData) return [];
        if (typeof utils.flattenQuarterData === 'function') {
            return utils.flattenQuarterData(quarterData);
        }

        const courses = [];
        Object.entries(quarterData).forEach(([day, dayData]) => {
            if (!dayData || typeof dayData !== 'object') return;
            Object.entries(dayData).forEach(([time, list]) => {
                if (!Array.isArray(list)) return;
                list.forEach((course) => courses.push({ ...course, day, time }));
            });
        });
        return courses;
    }

    function countQuarterCourses(scheduleData, quarter, options = {}) {
        return getQuarterCourses(scheduleData, quarter, resolveScheduleDataUtils(options)).length;
    }

    function setText(documentRef, id, value) {
        const element = documentRef.getElementById(id);
        if (element) element.textContent = value;
    }

    function clearElement(element) {
        if (!element) return;
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
    }

    function createElement(documentRef, tagName, className, text) {
        const element = documentRef.createElement(tagName);
        if (className) element.className = className;
        if (text !== undefined && text !== null) element.textContent = text;
        return element;
    }

    function createCourseBlock(documentRef, course) {
        const block = createElement(documentRef, 'article', 'public-course-block');

        const code = createElement(documentRef, 'div', 'public-course-code', normalizeCourseCode(course.code));
        const title = createElement(documentRef, 'div', 'public-course-title', String(course.name || course.title || 'Untitled course').trim());
        const instructor = createElement(documentRef, 'div', 'public-course-meta', String(course.instructor || 'TBD').trim());
        const details = [];
        if (course.section) details.push(`Section ${course.section}`);
        if (course.credits) details.push(`${course.credits} cr`);
        if (course.enrollmentCap) details.push(`Cap ${course.enrollmentCap}`);
        const section = createElement(documentRef, 'div', 'public-course-section', details.join(' | '));

        block.appendChild(code);
        block.appendChild(title);
        block.appendChild(instructor);
        if (details.length) block.appendChild(section);
        return block;
    }

    function getCoursesForCell(scheduleData, quarter, day, time, room) {
        const list = scheduleData?.[quarter]?.[day]?.[time];
        if (!Array.isArray(list)) return [];
        return list.filter((course) => String(course.room || '').trim() === room);
    }

    function getKnownRooms(scheduleData, quarter) {
        const seen = new Set(ROOM_ORDER);
        getQuarterCourses(scheduleData, quarter, { flattenQuarterData: null }).forEach((course) => {
            const room = String(course.room || '').trim();
            if (room && room !== 'ONLINE' && room !== 'ARRANGED' && room !== 'TBD') {
                seen.add(room);
            }
        });
        return Array.from(seen);
    }

    function renderScheduleGrid(state) {
        const { documentRef, scheduleData, activeQuarter } = state;
        const grid = documentRef.getElementById('publicScheduleGrid');
        clearElement(grid);

        const rooms = getKnownRooms(scheduleData, activeQuarter);
        grid.style.gridTemplateColumns = `104px repeat(${rooms.length}, minmax(132px, 1fr))`;

        ['Time', ...rooms.map((room) => ROOM_LABELS[room] || room)].forEach((label) => {
            grid.appendChild(createElement(documentRef, 'div', 'public-grid-header', label));
        });

        DAY_PATTERNS.forEach((day) => {
            const divider = createElement(documentRef, 'div', 'public-day-divider', day.label);
            grid.appendChild(divider);

            TIME_SLOTS.forEach((time) => {
                grid.appendChild(createElement(documentRef, 'div', 'public-time-slot', formatTimeSlot(time)));

                rooms.forEach((room) => {
                    const cell = createElement(documentRef, 'div', 'public-schedule-cell');
                    const courses = getCoursesForCell(scheduleData, activeQuarter, day.id, time, room);
                    courses.forEach((course) => cell.appendChild(createCourseBlock(documentRef, course)));
                    grid.appendChild(cell);
                });
            });
        });
    }

    function renderSpecialSections(state) {
        const { documentRef, scheduleData, activeQuarter, utils } = state;
        const container = documentRef.getElementById('publicSpecialSections');
        clearElement(container);

        const quarterData = scheduleData?.[activeQuarter] || {};
        const onlineCourses = typeof utils.getOnlineCoursesForQuarter === 'function'
            ? utils.getOnlineCoursesForQuarter(quarterData)
            : (quarterData.ONLINE?.async || []);
        const arrangedCourses = quarterData.ARRANGED?.arranged || [];

        [
            { title: 'Online', courses: onlineCourses },
            { title: 'Arranged', courses: arrangedCourses }
        ].forEach((group) => {
            if (!group.courses.length) return;

            const section = createElement(documentRef, 'section', 'public-special-group');
            const heading = createElement(documentRef, 'div', 'public-special-heading');
            heading.appendChild(createElement(documentRef, 'h3', '', group.title));
            heading.appendChild(createElement(documentRef, 'span', 'public-summary', `${group.courses.length} sections`));

            const list = createElement(documentRef, 'div', 'public-special-list');
            group.courses.forEach((course) => list.appendChild(createCourseBlock(documentRef, course)));

            section.appendChild(heading);
            section.appendChild(list);
            container.appendChild(section);
        });
    }

    function renderEmptyState(state) {
        const grid = state.documentRef.getElementById('publicScheduleGrid');
        clearElement(grid);
        grid.style.gridTemplateColumns = '1fr';
        grid.appendChild(createElement(state.documentRef, 'div', 'public-empty', 'No public schedule rows are available for this quarter.'));
        clearElement(state.documentRef.getElementById('publicSpecialSections'));
    }

    function renderErrorState(state, message) {
        const grid = state.documentRef.getElementById('publicScheduleGrid');
        clearElement(grid);
        grid.style.gridTemplateColumns = '1fr';
        grid.appendChild(createElement(state.documentRef, 'div', 'public-error', message || 'The public schedule could not be loaded.'));
        clearElement(state.documentRef.getElementById('publicSpecialSections'));
    }

    function render(state) {
        const quarterTitle = formatQuarterTitle(state.year, state.activeQuarter);
        const count = countQuarterCourses(state.scheduleData, state.activeQuarter, { scheduleDataUtils: state.utils });
        const countLabel = `${count} ${count === 1 ? 'section' : 'sections'}`;

        setText(state.documentRef, 'publicAcademicYearLabel', `AY ${state.year}`);
        setText(state.documentRef, 'publicQuarterLabel', quarterTitle);
        setText(state.documentRef, 'publicScheduleTitle', quarterTitle);
        setText(state.documentRef, 'publicScheduleSubtitle', `AY ${state.year}`);
        setText(state.documentRef, 'publicPanelCount', countLabel);

        if (count === 0) {
            renderEmptyState(state);
            return;
        }
        renderScheduleGrid(state);
        renderSpecialSections(state);
    }

    function setStatus(documentRef, text, state) {
        const status = documentRef.getElementById('publicStatus');
        if (!status) return;
        status.textContent = text;
        if (state) status.dataset.state = state;
    }

    function createPublicScheduleApp(options = {}) {
        const documentRef = resolveDocument(options);
        const utils = resolveScheduleDataUtils(options);
        const year = options.year || DEFAULTS.year;
        const programCode = options.programCode || DEFAULTS.programCode;
        const getClient = options.getClient || (() => {
            if (typeof root.getSupabaseClient === 'function') {
                return root.getSupabaseClient();
            }
            return null;
        });

        const state = {
            documentRef,
            utils,
            year,
            programCode,
            activeQuarter: options.quarter || DEFAULTS.quarter,
            scheduleData: createEmptySchedule(utils)
        };

        async function load() {
            const client = getClient();
            if (!client || typeof client.rpc !== 'function') {
                throw new Error('Public schedule data service is not available.');
            }

            const { data, error } = await client.rpc('get_public_schedule', {
                p_academic_year: year,
                p_program_code: programCode,
                p_quarter: state.activeQuarter
            });

            if (error) throw error;
            return buildScheduleFromPublicRows(data || [], { scheduleDataUtils: utils });
        }

        return {
            state,
            async init() {
                if (!documentRef) return;
                setStatus(documentRef, 'Loading', 'loading');
                render(state);

                try {
                    state.scheduleData = await load();
                    setStatus(documentRef, 'Live schedule', 'ready');
                    render(state);
                } catch (error) {
                    setStatus(documentRef, 'Unavailable', 'error');
                    renderErrorState(state, error.message || 'The public schedule could not be loaded.');
                }
            }
        };
    }

    return {
        DEFAULTS,
        QUARTERS,
        DAY_PATTERNS,
        TIME_SLOTS,
        ROOM_ORDER,
        buildScheduleFromPublicRows,
        countQuarterCourses,
        createPublicScheduleApp,
        formatQuarterTitle,
        formatTimeSlot,
        normalizePublicScheduleRows
    };
});
