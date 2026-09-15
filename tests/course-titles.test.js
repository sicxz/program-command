const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const programCommand = fs.readFileSync(path.join(repoRoot, 'program-command.html'), 'utf8');
const courseCatalog = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'data', 'course-catalog.json'), 'utf8')
);

function extractCourseTitleOverrides() {
    const match = programCommand.match(/const COURSE_TITLE_OVERRIDES = \{([\s\S]*?)\n\s*\};/);
    if (!match) throw new Error('COURSE_TITLE_OVERRIDES was not found');

    return Object.fromEntries(
        Array.from(match[1].matchAll(/'([^']+)'\s*:\s*'([^']+)'/g), ([, code, title]) => [code, title])
    );
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

test('the scheduler map and generated catalog use the four approved course titles', () => {
    const expected = {
        'DESN 368': 'Web Design + Code 1',
        'DESN 378': 'Web Design + Code 2',
        'DESN 468': 'Web Design + Code 3',
        'DESN 374': 'Applied Design'
    };
    const titleOverrides = extractCourseTitleOverrides();
    const catalogByCode = Object.fromEntries(
        courseCatalog.courses.map((course) => [course.code, course.title])
    );

    expect(Object.fromEntries(Object.keys(expected).map((code) => [code, titleOverrides[code]]))).toEqual(expected);
    expect(Object.fromEntries(Object.keys(expected).map((code) => [code, catalogByCode[code]]))).toEqual(expected);
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
