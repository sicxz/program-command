const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractFunction(source, name) {
    const marker = `function ${name}(`;
    const start = source.indexOf(marker);
    if (start < 0) throw new Error(`Could not find ${name}`);

    const bodyStart = source.indexOf('{', start);
    let depth = 0;
    for (let index = bodyStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`Could not find the end of ${name}`);
}

test('a registering-declining course keeps its direction on the tile and in analytics', () => {
    document.body.innerHTML = '<div id="scheduleGrid"></div><div id="enrollmentAnalytics"></div>';
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'program-command.html'), 'utf8');
    const courses = [
        { code: 'DESN 100', name: 'Drawing', instructor: 'A.Adams', room: 'CEB', credits: 4 },
        { code: 'DESN 200', name: 'Design', instructor: 'B.Brown', room: 'CEB', credits: 4 }
    ];
    const enrollments = {
        'DESN 100': {
            average: 20, peak: 45, trend: 'declining', registering: true,
            quarterly: { 'fall-2023': 45, 'fall-2024': 30, 'fall-2025': 23 },
            trendComparison: { latestTerm: 'fall-2026', latestCount: 23, priorTerm: 'fall-2025', priorCount: 45, delta: -22 }
        },
        'DESN 200': {
            average: 21, peak: 30, trend: 'declining', registering: false,
            quarterly: { 'fall-2023': 25, 'fall-2024': 24, 'fall-2025': 21 }
        }
    };
    const scheduleData = { fall: { MW: { morning: courses } } };
    const sandbox = {
        document,
        window: {},
        scheduleData,
        currentAcademicYear: '2026-27',
        getSchedulerDayIds: () => ['MW'],
        getSchedulerTimeSlotIds: () => ['morning'],
        syncSchedulerRoomLabelsForYear: jest.fn(),
        getScheduleGridRoomsForYear: () => ['CEB'],
        getScheduleViewRoomHeaderLabel: room => room,
        getSchedulerTimeSlotDisplayText: time => time,
        appendSchedulerTimeSlotContent: (node, time) => { node.textContent = time; },
        getSchedulerDayLabel: day => day,
        normalizeScheduleGridRoomForYear: room => room,
        getFacultyClass: () => 'faculty-full-time',
        getEnrollmentData: code => enrollments[code],
        getSnapshotEnrollment: () => null,
        getScheduledSectionCap: () => 20,
        getNoHistoryBadgeText: () => 'NO HISTORY',
        getEnrollmentLevel: () => 'medium',
        formatTrendComparison: comparison => comparison ? 'fall-2026 23 vs fall-2025 45 (-22)' : '',
        getCanonicalCourseTitleByCode: (code, title) => title,
        setupDragAndDrop: jest.fn(),
        renderFacultyLegend: jest.fn(),
        applyConflictFilter: jest.fn(),
        deleteCourse: jest.fn(),
        showCourseDetails: jest.fn(),
        readOnlineCoursesFromQuarter: () => [],
        lowEnrollmentThreshold: () => 10,
        normalizeCourseCode: code => code,
        createQuarterCell: value => {
            const cell = document.createElement('td');
            cell.textContent = value ?? '—';
            return cell;
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(extractFunction(html, 'renderSchedule'), sandbox);
    vm.runInContext(extractFunction(html, 'createEnrollmentCategory'), sandbox);
    vm.runInContext(extractFunction(html, 'renderEnrollmentAnalytics'), sandbox);

    sandbox.renderSchedule('fall');
    const tile = document.querySelector('[data-course-code="DESN 100"]');
    expect(tile.classList.contains('trend-declining')).toBe(true);
    expect(tile.classList.contains('trend-registering')).toBe(true);
    expect(tile.title).toContain('Trend: declining · registering: counts before census');

    sandbox.renderEnrollmentAnalytics('fall');
    const trendRow = [...document.querySelectorAll('.enrollment-history-table tbody tr')]
        .find(row => row.firstElementChild.textContent.includes('DESN 100'));
    expect(trendRow.lastElementChild.textContent).toBe('📉 🕒 declining');
    const decliningTags = [...document.querySelectorAll('.enrollment-course-tag.declining')];
    expect(decliningTags.map(tag => tag.textContent)).toEqual([
        expect.stringContaining('DESN 200'),
        expect.stringContaining('DESN 100')
    ]);
});

test('Program Command trends compare fill rate from the seats file and say so in the tooltip', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'program-command.html'), 'utf8');
    const read = file => JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'));
    const sandbox = {
        window: { EnrollmentViewModel: require('../js/enrollment-view-model.js') },
        enrollmentData: read('enrollment-dashboard-data.json').courseStats,
        enrollmentDataByCode: {},
        registrationSnapshots: read('data/enrollment-registration-snapshots.json'),
        enrollmentCalendar: read('data/academic-calendar.json'),
        courseSeats: read('data/course-seats-by-quarter.json'),
        normalizeCourseCode: code => code,
        Date: class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-09-22T12:00:00-07:00'])); } }
    };
    vm.createContext(sandbox);
    ['getSnapshotEnrollment', 'rebuildEnrollmentLookup', 'formatTrendComparison']
        .forEach(name => vm.runInContext(extractFunction(html, name), sandbox));
    sandbox.rebuildEnrollmentLookup();

    const course = code => vm.runInContext(`enrollmentDataByCode[${JSON.stringify(code)}]`, sandbox);
    expect(course('DESN 263')).toMatchObject({ trend: 'declining', trendComparison: { basis: 'fill', fillDelta: -22 } });
    expect(course('DESN 100')).toMatchObject({ trend: 'stable', trendComparison: { basis: 'fill', latestSeats: 23, priorSeats: 48 } });
    expect(sandbox.formatTrendComparison(course('DESN 263').trendComparison))
        .toBe('Fall 2025 92% full → Fall 2026 70% full (−22 pts)');
    expect(sandbox.formatTrendComparison({
        latestTerm: 'fall-2026', latestCount: 17, priorTerm: 'fall-2025', priorCount: 20, delta: -3, basis: 'seats'
    })).toBe('fall-2026 17 vs fall-2025 20 (-3)');

    vm.runInContext('courseSeats = null', sandbox);
    sandbox.rebuildEnrollmentLookup();
    expect(course('DESN 263').trendComparison).toMatchObject({ basis: 'seats', delta: -8, fillDelta: null });
});
