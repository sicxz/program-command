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

    const PUBLIC_YEARS = Object.freeze(['2026-27', '2025-26', '2024-25', '2023-24']);
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
    const ROOM_ORDER = Object.freeze(['206', '209', '210', '212', 'CEB 102', 'CEB 104']);
    const ROOM_LABELS = Object.freeze({
        '206': 'UX Lab',
        '209': 'Mac Lab 1',
        '210': 'Mac Lab 2',
        '212': 'Mac Lab 3',
        'CEB 104': 'Mac Lab 4',
        'CEB 102': 'Design Studio'
    });
    const COURSE_CATALOG_PATH = 'data/course-catalog.json';
    const COURSE_TITLE_OVERRIDES = Object.freeze({
        'DESN 100': 'Drawing for Communication',
        'DESN 200': 'Visual Thinking + Making',
        'DESN 210': 'Design Lab',
        'DESN 213': 'Photoshop',
        'DESN 214': 'Illustrator',
        'DESN 215': 'Indesign',
        'DESN 216': 'Digital Foundations',
        'DESN 217': 'Figma',
        'DESN 243': 'Typography',
        'DESN 263': 'Visual Communication Design',
        'DESN 301': 'Visual Storytelling',
        'DESN 305': 'Social Media Design and Management',
        'DESN 325': 'Emergent Design',
        'DESN 326': 'Introduction to Animation',
        'DESN 335': 'Board Game Design',
        'DESN 336': '3D Animation',
        'DESN 338': 'User Experience Design 1',
        'DESN 343': 'Typography 2',
        'DESN 345': 'Digital Game Design',
        'DESN 348': 'User Experience Design 2',
        'DESN 350': 'Digital Photography',
        'DESN 351': 'Advanced Photography',
        'DESN 355': 'Motion Design',
        'DESN 359': 'Histories of Design',
        'DESN 360': 'Zine and Publication Design',
        'DESN 365': 'Motion Design 2',
        'DESN 366': 'Production Design',
        'DESN 368': 'Code + Design 1',
        'DESN 369': 'Web Development 1',
        'DESN 374': 'AI + Design',
        'DESN 375': 'Digital Video',
        'DESN 378': 'Code + Design 2',
        'DESN 379': 'Web Development 2',
        'DESN 384': 'Digital Sound',
        'DESN 396': 'Experimental Course',
        'DESN 398': 'Seminar',
        'DESN 399': 'Directed Study',
        'DESN 401': 'Imaginary Worlds',
        'DESN 446': '4D Animation',
        'DESN 458': 'User Experience Design 3',
        'DESN 463': 'Community-Driven Design',
        'DESN 468': 'Code + Design 3',
        'DESN 469': 'Web Development 3',
        'DESN 480': 'Professional Practice',
        'DESN 490': 'Senior Capstone',
        'DESN 491': 'Senior Project',
        'DESN 493': 'Portfolio Practice',
        'DESN 495': 'Internship',
        'DESN 496': 'Experimental',
        'DESN 497': 'Workshop, Short Course, Conference, Seminar',
        'DESN 498': 'Seminar',
        'DESN 499': 'Directed Study'
    });
    const PUBLIC_ROOM_SET = new Set(ROOM_ORDER);
    const PUBLIC_SPECIAL_ROOM_SET = new Set(['ONLINE', 'ARRANGED']);
    const FACULTY_COLORS = Object.freeze({
        'T.Masingale': { className: 'faculty-masingale', color: '#667eea', name: 'T.Masingale' },
        'S.Durr': { className: 'faculty-durr', color: '#e67e22', name: 'S.Durr' },
        'C.Manikoth': { className: 'faculty-manikoth', color: '#27ae60', name: 'C.Manikoth' },
        'S.Mills': { className: 'faculty-mills', color: '#9b59b6', name: 'S.Mills' },
        'M.Lybbert': { className: 'faculty-lybbert', color: '#e74c3c', name: 'M.Lybbert' },
        'G.Hustrulid': { className: 'faculty-hustrulid', color: '#f39c12', name: 'G.Hustrulid' },
        'A.Sopu': { className: 'faculty-sopu', color: '#3498db', name: 'A.Sopu' },
        'E.Norris': { className: 'faculty-norris', color: '#1abc9c', name: 'E.Norris' },
        'J.Braukmann': { className: 'faculty-braukmann', color: '#34495e', name: 'J.Braukmann' },
        'S.Allison': { className: 'faculty-allison', color: '#d35400', name: 'S.Allison' },
        'Barton/Pettigrew': { className: 'faculty-online', color: '#7f8c8d', name: 'Barton/Pettigrew' },
        'Adjunct': { className: 'faculty-adjunct', color: '#95a5a6', name: 'Adjunct' },
        'TBD': { className: 'faculty-tbd', color: '#bdc3c7', name: 'TBD' }
    });
    const FALLBACK_FACULTY_COLORS = Object.freeze([
        '#0ea5e9',
        '#14b8a6',
        '#84cc16',
        '#f97316',
        '#ec4899',
        '#8b5cf6',
        '#64748b',
        '#ca8a04'
    ]);
    const FACULTY_ALIASES = Object.freeze([
        { canonical: 'T.Masingale', keys: ['tmasingale', 'tmasingal', 'travismasingale', 'masingale'] },
        { canonical: 'S.Durr', keys: ['sdurr', 'sarahdurr', 'durr'] },
        { canonical: 'C.Manikoth', keys: ['cmanikoth', 'colinmanikoth', 'manikoth'] },
        { canonical: 'S.Mills', keys: ['smills', 'sarahmills', 'mills'] },
        { canonical: 'M.Lybbert', keys: ['mlybbert', 'mattlybbert', 'lybbert'] },
        { canonical: 'G.Hustrulid', keys: ['ghustrulid', 'ginahustrulid', 'hustrulid'] },
        { canonical: 'A.Sopu', keys: ['asopu', 'arianasopu', 'sopu'] },
        { canonical: 'E.Norris', keys: ['enorris', 'evannorris', 'norris'] },
        { canonical: 'J.Braukmann', keys: ['jbraukmann', 'jessicabraukmann', 'braukmann'] },
        { canonical: 'S.Allison', keys: ['sallison', 'scottallison', 'allison'] },
        { canonical: 'Barton/Pettigrew', keys: ['bartonpettigrew', 'barton', 'pettigrew', 'online'] },
        { canonical: 'Adjunct', keys: ['adjunct'] },
        { canonical: 'TBD', keys: ['tbd'] }
    ]);

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

    function normalizeCatalogCourse(course) {
        const code = normalizeCourseCode(course?.code);
        if (!code) return null;
        return {
            code,
            title: String(course?.title || '').trim(),
            defaultCredits: Number(course?.defaultCredits ?? course?.default_credits)
        };
    }

    function createCourseCatalogByCode(catalog) {
        const byCode = {};
        const courses = Array.isArray(catalog?.courses)
            ? catalog.courses
            : Array.isArray(catalog)
                ? catalog
                : [];

        courses.forEach((course) => {
            const normalized = normalizeCatalogCourse(course);
            if (!normalized) return;
            byCode[normalized.code] = normalized;
        });

        return byCode;
    }

    function normalizeCourseCatalogByCode(value) {
        const byCode = {};
        if (!value || typeof value !== 'object') return byCode;
        Object.entries(value).forEach(([code, course]) => {
            const normalized = normalizeCatalogCourse({
                ...course,
                code: course?.code || code
            });
            if (!normalized) return;
            byCode[normalized.code] = normalized;
        });
        return byCode;
    }

    function getCanonicalCourseTitleByCode(courseCode, fallbackTitle = '', courseCatalogByCode = {}) {
        const code = normalizeCourseCode(courseCode);
        if (!code) return String(fallbackTitle || '').trim();
        const overrideTitle = COURSE_TITLE_OVERRIDES[code];
        if (overrideTitle) return overrideTitle;
        const catalogTitle = String(courseCatalogByCode?.[code]?.title || '').trim();
        if (catalogTitle) return catalogTitle;
        return String(fallbackTitle || '').trim();
    }

    function getCanonicalCourseCreditsByCode(courseCode, fallbackCredits, courseCatalogByCode = {}) {
        const code = normalizeCourseCode(courseCode);
        const catalogCredits = Number(courseCatalogByCode?.[code]?.defaultCredits);
        if (Number.isFinite(catalogCredits) && catalogCredits > 0) return catalogCredits;
        const credits = Number(fallbackCredits);
        return Number.isFinite(credits) && credits > 0 ? credits : 5;
    }

    function normalizeFacultyKey(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function getCanonicalFacultyName(value) {
        const raw = String(value || '').trim();
        if (!raw) return 'TBD';

        const exact = FACULTY_COLORS[raw];
        if (exact) return exact.name;

        const compact = normalizeFacultyKey(raw);
        const match = FACULTY_ALIASES.find((entry) => entry.keys.some((key) => compact.includes(key) || key.includes(compact)));
        return match ? match.canonical : raw;
    }

    function getFallbackFacultyColor(name) {
        const key = normalizeFacultyKey(name);
        if (!key) return FACULTY_COLORS.TBD.color;
        let hash = 0;
        for (let index = 0; index < key.length; index += 1) {
            hash = (hash * 31 + key.charCodeAt(index)) % 9973;
        }
        return FALLBACK_FACULTY_COLORS[hash % FALLBACK_FACULTY_COLORS.length];
    }

    function getFacultyInfo(value) {
        const canonical = getCanonicalFacultyName(value);
        const known = FACULTY_COLORS[canonical];
        if (known) return known;
        return {
            className: 'faculty-generated',
            color: getFallbackFacultyColor(canonical),
            name: canonical || 'TBD'
        };
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

    function getTimeSlotParts(value) {
        const [start, end] = String(value || '').split('-');
        if (!start || !end) {
            return { start: String(value || '').trim(), end: '' };
        }
        return { start: formatClock(start), end: formatClock(end) };
    }

    function createTimeLabelElement(documentRef, className, value) {
        const match = String(value || '').trim().match(/^(.+?)\s+(AM|PM)$/i);
        const label = createElement(documentRef, 'span', className);

        if (!match) {
            label.appendChild(documentRef.createTextNode(String(value || '').trim()));
            return label;
        }

        label.appendChild(createElement(documentRef, 'span', 'public-time-clock', match[1]));
        label.appendChild(createElement(documentRef, 'span', 'public-time-period', match[2].toUpperCase()));
        return label;
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

    function normalizePublicYear(value) {
        const year = String(value || '').trim();
        return PUBLIC_YEARS.includes(year) ? year : DEFAULTS.year;
    }

    function normalizePublicQuarter(value) {
        const quarter = String(value || '').trim().toLowerCase();
        return QUARTERS.includes(quarter) ? quarter : DEFAULTS.quarter;
    }

    function normalizePublicScheduleRows(rows, options = {}) {
        const courseCatalogByCode = options.courseCatalogByCode || {};
        return (Array.isArray(rows) ? rows : []).map((row) => ({
            quarter: row.quarter,
            day_pattern: row.day_pattern,
            time_slot: row.time_slot,
            section: row.section,
            projected_enrollment: row.projected_enrollment,
            course: {
                code: row.course_code,
                title: getCanonicalCourseTitleByCode(row.course_code, row.course_title, courseCatalogByCode),
                default_credits: getCanonicalCourseCreditsByCode(row.course_code, row.credits, courseCatalogByCode)
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
        const normalizedRows = normalizePublicScheduleRows(rows, {
            courseCatalogByCode: options.courseCatalogByCode || {}
        });

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
        return getPublicQuarterCourses(scheduleData, quarter, resolveScheduleDataUtils(options)).length;
    }

    function isPubliclyVisibleCourse(course) {
        const room = String(course?.room || '').trim().toUpperCase();
        return PUBLIC_ROOM_SET.has(room) || PUBLIC_SPECIAL_ROOM_SET.has(room);
    }

    function getPublicQuarterCourses(scheduleData, quarter, utils) {
        return getQuarterCourses(scheduleData, quarter, utils).filter(isPubliclyVisibleCourse);
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
        const facultyInfo = getFacultyInfo(course.instructor);
        const block = createElement(documentRef, 'article', `public-course-block ${facultyInfo.className}`);
        block.dataset.faculty = facultyInfo.name;
        block.style.setProperty('--faculty-accent', facultyInfo.color);

        const code = createElement(documentRef, 'div', 'public-course-code', normalizeCourseCode(course.code));
        const title = createElement(documentRef, 'div', 'public-course-title', String(course.name || course.title || 'Untitled course').trim());
        const instructor = createElement(documentRef, 'div', 'public-course-meta');
        const color = createElement(documentRef, 'span', 'public-faculty-dot');
        color.style.backgroundColor = facultyInfo.color;
        instructor.appendChild(color);
        instructor.appendChild(documentRef.createTextNode(facultyInfo.name));
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

    function createTimeSlotElement(documentRef, time) {
        const parts = getTimeSlotParts(time);
        const slot = createElement(documentRef, 'div', 'public-time-slot');
        slot.setAttribute('aria-label', parts.end ? `${parts.start} to ${parts.end}` : parts.start);
        slot.appendChild(createTimeLabelElement(documentRef, 'public-time-start', parts.start));
        if (parts.end) {
            slot.appendChild(createTimeLabelElement(documentRef, 'public-time-end', parts.end));
        }
        return slot;
    }

    function getCoursesForCell(scheduleData, quarter, day, time, room) {
        const list = scheduleData?.[quarter]?.[day]?.[time];
        if (!Array.isArray(list)) return [];
        return list.filter((course) => String(course.room || '').trim() === room);
    }

    function getKnownRooms(scheduleData, quarter) {
        return ROOM_ORDER;
    }

    function renderYearTabs(state) {
        const { documentRef, year } = state;
        const tabs = documentRef.getElementById('publicYearTabs');
        clearElement(tabs);
        if (!tabs) return;

        PUBLIC_YEARS.forEach((publicYear) => {
            const button = createElement(documentRef, 'button', 'public-year-tab');
            button.type = 'button';
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-selected', publicYear === year ? 'true' : 'false');
            button.dataset.year = publicYear;
            button.appendChild(createElement(documentRef, 'span', 'public-year-label', 'AY'));
            button.appendChild(createElement(documentRef, 'span', 'public-year-value', publicYear));
            button.title = `Academic year ${publicYear}`;
            button.addEventListener('click', () => {
                if (typeof state.onYearChange === 'function') {
                    state.onYearChange(publicYear);
                }
            });
            tabs.appendChild(button);
        });
    }

    function renderQuarterTabs(state) {
        const { documentRef, scheduleData, activeQuarter, year } = state;
        const tabs = documentRef.getElementById('publicQuarterTabs');
        clearElement(tabs);

        QUARTERS.forEach((quarter) => {
            const button = createElement(documentRef, 'button', 'public-quarter-tab');
            const quarterTitle = formatQuarterTitle(year, quarter);
            const count = countQuarterCourses(scheduleData, quarter, { scheduleDataUtils: state.utils });
            button.type = 'button';
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-selected', quarter === activeQuarter ? 'true' : 'false');
            button.dataset.quarter = quarter;
            button.appendChild(createElement(documentRef, 'span', 'public-quarter-name', QUARTER_LABELS[quarter]));
            button.appendChild(createElement(documentRef, 'span', 'public-quarter-year', getDisplayYear(year, quarter)));
            button.appendChild(createElement(documentRef, 'span', 'public-quarter-count', `${count} ${count === 1 ? 'section' : 'sections'}`));
            button.title = quarterTitle;
            button.addEventListener('click', () => {
                state.activeQuarter = quarter;
                render(state);
            });
            tabs.appendChild(button);
        });
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
                grid.appendChild(createTimeSlotElement(documentRef, time));

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

    function getFacultyLegendEntries(state) {
        const courses = getPublicQuarterCourses(state.scheduleData, state.activeQuarter, state.utils);
        const summaries = new Map();

        courses.forEach((course) => {
            const info = getFacultyInfo(course.instructor || 'TBD');
            if (!summaries.has(info.name)) {
                summaries.set(info.name, {
                    name: info.name,
                    className: info.className,
                    color: info.color,
                    sections: 0
                });
            }

            const summary = summaries.get(info.name);
            summary.sections += 1;
        });

        return Array.from(summaries.values()).sort((a, b) => {
            if (b.sections !== a.sections) return b.sections - a.sections;
            return a.name.localeCompare(b.name);
        });
    }

    function renderFacultyLegend(state) {
        const legend = state.documentRef.getElementById('publicFacultyLegend');
        clearElement(legend);
        if (!legend) return;

        const entries = getFacultyLegendEntries(state);
        const header = createElement(state.documentRef, 'div', 'public-faculty-legend-header');
        header.appendChild(createElement(state.documentRef, 'strong', '', 'Faculty key'));
        header.appendChild(createElement(state.documentRef, 'span', '', `${formatQuarterTitle(state.year, state.activeQuarter)} | ${entries.length} faculty`));
        legend.appendChild(header);

        if (!entries.length) {
            legend.appendChild(createElement(state.documentRef, 'div', 'public-faculty-legend-empty', 'No faculty assigned for this quarter yet.'));
            return;
        }

        const list = createElement(state.documentRef, 'div', 'public-faculty-legend-list');
        entries.forEach((entry) => {
            const item = createElement(state.documentRef, 'div', `public-faculty-legend-item ${entry.className}`);
            item.style.setProperty('--faculty-accent', entry.color);
            item.appendChild(createElement(state.documentRef, 'span', 'public-faculty-swatch'));
            item.appendChild(createElement(state.documentRef, 'span', 'public-faculty-name', entry.name));
            item.appendChild(createElement(state.documentRef, 'span', 'public-faculty-meta', `${entry.sections} ${entry.sections === 1 ? 'section' : 'sections'}`));
            list.appendChild(item);
        });
        legend.appendChild(list);
    }

    function renderEmptyState(state) {
        const grid = state.documentRef.getElementById('publicScheduleGrid');
        clearElement(grid);
        grid.style.gridTemplateColumns = '1fr';
        grid.appendChild(createElement(state.documentRef, 'div', 'public-empty', 'No public schedule rows are available for this quarter.'));
        clearElement(state.documentRef.getElementById('publicSpecialSections'));
        renderFacultyLegend(state);
    }

    function renderErrorState(state, message) {
        const grid = state.documentRef.getElementById('publicScheduleGrid');
        clearElement(grid);
        grid.style.gridTemplateColumns = '1fr';
        grid.appendChild(createElement(state.documentRef, 'div', 'public-error', message || 'The public schedule could not be loaded.'));
        clearElement(state.documentRef.getElementById('publicSpecialSections'));
        clearElement(state.documentRef.getElementById('publicFacultyLegend'));
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

        renderYearTabs(state);
        renderQuarterTabs(state);
        renderFacultyLegend(state);
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

    async function loadCourseCatalog(options = {}) {
        if (options.courseCatalogByCode) {
            return normalizeCourseCatalogByCode(options.courseCatalogByCode);
        }
        if (options.courseCatalog) {
            return createCourseCatalogByCode(options.courseCatalog);
        }

        const fetchCatalog = options.fetchCourseCatalog
            || (typeof root.fetch === 'function'
                ? (catalogPath) => root.fetch(catalogPath).then((response) => {
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    return response.json();
                })
                : null);

        if (!fetchCatalog) return {};

        try {
            return createCourseCatalogByCode(await fetchCatalog(options.catalogPath || COURSE_CATALOG_PATH));
        } catch (error) {
            console.warn('Could not load public course catalog. Falling back to RPC course titles.', error);
            return {};
        }
    }

    function createPublicScheduleApp(options = {}) {
        const documentRef = resolveDocument(options);
        const utils = resolveScheduleDataUtils(options);
        const programCode = options.programCode || DEFAULTS.programCode;
        const getClient = options.getClient || (() => {
            if (typeof root.getSupabaseClient === 'function') {
                return root.getSupabaseClient();
            }
            return null;
        });
        let loadRequestId = 0;

        const state = {
            documentRef,
            utils,
            year: normalizePublicYear(options.year || DEFAULTS.year),
            programCode,
            activeQuarter: normalizePublicQuarter(options.quarter || DEFAULTS.quarter),
            courseCatalogByCode: {},
            scheduleData: createEmptySchedule(utils),
            onYearChange: null
        };
        let catalogPromise = null;

        async function ensureCourseCatalogLoaded() {
            if (!catalogPromise) {
                catalogPromise = loadCourseCatalog(options);
            }
            state.courseCatalogByCode = await catalogPromise;
            return state.courseCatalogByCode;
        }

        async function load(yearToLoad) {
            const client = getClient();
            if (!client || typeof client.rpc !== 'function') {
                throw new Error('Public schedule data service is not available.');
            }

            const courseCatalogByCode = await ensureCourseCatalogLoaded();
            const { data, error } = await client.rpc('get_public_schedule', {
                p_academic_year: yearToLoad,
                p_program_code: programCode,
                p_quarter: null
            });

            if (error) throw error;
            return buildScheduleFromPublicRows(data || [], {
                scheduleDataUtils: utils,
                courseCatalogByCode
            });
        }

        async function loadSelectedYear() {
            const requestId = loadRequestId + 1;
            const yearToLoad = state.year;
            loadRequestId = requestId;
            state.scheduleData = createEmptySchedule(utils);
            setStatus(documentRef, 'Loading', 'loading');
            render(state);

            try {
                const scheduleData = await load(yearToLoad);
                if (requestId !== loadRequestId) return;
                state.scheduleData = scheduleData;
                setStatus(documentRef, 'Live schedule', 'ready');
                render(state);
            } catch (error) {
                if (requestId !== loadRequestId) return;
                setStatus(documentRef, 'Unavailable', 'error');
                renderErrorState(state, error.message || 'The public schedule could not be loaded.');
            }
        }

        async function setYear(nextYear) {
            const publicYear = normalizePublicYear(nextYear);
            if (publicYear === state.year) return;
            state.year = publicYear;
            state.activeQuarter = DEFAULTS.quarter;
            await loadSelectedYear();
        }

        state.onYearChange = setYear;

        return {
            state,
            setYear,
            async init() {
                if (!documentRef) return;
                await loadSelectedYear();
            }
        };
    }

    return {
        DEFAULTS,
        PUBLIC_YEARS,
        QUARTERS,
        DAY_PATTERNS,
        TIME_SLOTS,
        ROOM_ORDER,
        FACULTY_COLORS,
        buildScheduleFromPublicRows,
        createCourseCatalogByCode,
        countQuarterCourses,
        createPublicScheduleApp,
        formatQuarterTitle,
        getCanonicalCourseTitleByCode,
        getCanonicalFacultyName,
        getFallbackFacultyColor,
        getFacultyInfo,
        loadCourseCatalog,
        formatTimeSlot,
        normalizePublicYear,
        normalizePublicScheduleRows
    };
});
