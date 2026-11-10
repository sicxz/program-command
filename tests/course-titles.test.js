const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const programCommand = fs.readFileSync(path.join(repoRoot, 'program-command.html'), 'utf8');
const publicSchedule = fs.readFileSync(path.join(repoRoot, 'pages', 'public-schedule.js'), 'utf8');
const courseCatalog = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'data', 'course-catalog.json'), 'utf8')
);

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

// The scheduler's title resolution with the fallback catalog under test control.
function createSchedulerTitleSandbox(courseCatalogByCode) {
    const sandbox = { courseCatalogByCode, normalizeOnlineQuarterBucket: () => {} };
    vm.createContext(sandbox);
    ['normalizeCourseCode', 'getCanonicalCourseTitleByCode', 'normalizeScheduleCourseCodes']
        .forEach((name) => vm.runInContext(extractFunction(programCommand, name), sandbox));
    return sandbox;
}

function extractNoHistoryBadgeText() {
    const helpers = programCommand.match(
        /function getAcademicYearStart\(academicYear\) \{[\s\S]*?(?=\n\s*const scheduleData =)/
    );
    if (!helpers) throw new Error('Course history badge logic was not found');
    const normalizeCourseCode = (code) => String(code || '').trim().toUpperCase().replace(/-/g, ' ');

    return Function(
        'normalizeCourseCode',
        'getEnrollmentData',
        'registrationSnapshots',
        'currentAcademicYear',
        'localStorage',
        'scheduleStorageKeyPrefix',
        `${helpers[0]}; return getNoHistoryBadgeText;`
    )(
        normalizeCourseCode,
        () => ({}),
        null,
        '2026-27',
        { length: 0, key: () => null, getItem: () => null },
        'designSchedulerData_'
    );
}

test('the generated catalog carries the four approved titles and no page hardcodes a title map', () => {
    const expected = {
        'DESN 368': 'Web Design + Code 1',
        'DESN 378': 'Web Design + Code 2',
        'DESN 468': 'Web Design + Code 3',
        'DESN 374': 'Applied AI'
    };
    const catalogByCode = Object.fromEntries(
        courseCatalog.courses.map((course) => [course.code, course.title])
    );

    expect(Object.fromEntries(Object.keys(expected).map((code) => [code, catalogByCode[code]]))).toEqual(expected);

    // The Supabase courses row is the title authority; nothing in the pages may win over it.
    expect(programCommand).not.toContain('COURSE_TITLE_OVERRIDES');
    expect(publicSchedule).not.toContain('COURSE_TITLE_OVERRIDES');
    expect(programCommand).not.toContain('courses-202526.md');
    expect(programCommand).not.toContain('syncCourseCatalogTitlesToSupabase');
});

test('the scheduler shows the database title and uses the catalog only for a course without one', () => {
    const sandbox = createSchedulerTitleSandbox({
        'DESN 368': { title: 'Web Design + Code 1' },
        'DESN 374': { title: 'Applied Design' }
    });
    sandbox.data = {
        fall: {
            MW: {
                '10:00-12:20': [
                    { code: 'DESN 374', name: 'Applied AI' },
                    { code: 'DESN 368', name: 'DESN 368' },
                    { code: 'DESN 999', name: 'DESN 999' }
                ]
            }
        }
    };

    const names = Array.from(vm.runInContext(
        "normalizeScheduleCourseCodes(data); data.fall.MW['10:00-12:20'].map((course) => course.name)",
        sandbox
    ));

    // The courses row ("Applied AI") beats a stale catalog ("Applied Design");
    // the catalog fills in only the course that carried no title (its name was
    // its own code); a code in neither place keeps the placeholder.
    expect(names).toEqual(['Applied AI', 'Web Design + Code 1', 'DESN 999']);
    expect(vm.runInContext("getCanonicalCourseTitleByCode('DESN 374', 'Renamed in Course Management')", sandbox))
        .toBe('Renamed in Course Management');
    expect(vm.runInContext("getCanonicalCourseTitleByCode('DESN 368', '')", sandbox)).toBe('Web Design + Code 1');
});

test('a previously offered no-history course gets NO HISTORY instead of NEW', () => {
    const getBadgeText = extractNoHistoryBadgeText();
    const noEnrollmentHistory = { average: 0, peak: 0, quarterly: {} };

    expect(getBadgeText('DESN 369', {
        enrollment: noEnrollmentHistory,
        currentAcademicYear: '2026-27',
        registrationSnapshots: {
            terms: [{
                academicYear: '2025-26',
                sections: [{ course: 'DESN 369' }]
            }]
        },
        savedSchedules: []
    })).toBe('NO HISTORY');

    expect(getBadgeText('DESN 374', {
        enrollment: noEnrollmentHistory,
        currentAcademicYear: '2026-27',
        registrationSnapshots: { terms: [] },
        savedSchedules: [{
            academicYear: '2025-26',
            schedule: { fall: { MW: { morning: [{ code: 'DESN 374' }] } } }
        }]
    })).toBe('NO HISTORY');
});

test('a genuinely introduced course keeps the NEW badge', () => {
    expect(extractNoHistoryBadgeText()('DESN 499X', {
        enrollment: { average: 0, peak: 0, quarterly: {} },
        currentAcademicYear: '2026-27',
        registrationSnapshots: { terms: [] },
        savedSchedules: []
    })).toBe('NEW');
});

test('courses with quarterly history keep gap cells unbadged', () => {
    const getBadgeText = extractNoHistoryBadgeText();
    expect(getBadgeText('DESN 263', {
        enrollment: { quarterly: { 'spring-2024': 18 } },
        currentAcademicYear: '2026-27',
        registrationSnapshots: { terms: [] },
        savedSchedules: []
    })).toBe('');

    expect(programCommand.match(/hasAnyQuarterlyHistory \? '' : noHistoryBadgeText/g)).toHaveLength(3);
});
