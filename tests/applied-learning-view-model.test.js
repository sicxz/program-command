const fs = require('fs');
const path = require('path');
const model = require('../js/applied-learning-view-model.js');
const EnrollmentViewModel = require('../js/enrollment-view-model.js');
const WorkloadIntegration = require('../js/workload-integration.js');
const read = file => JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
const history = read('enrollment-dashboard-data.json');
const snapshots = read('data/enrollment-registration-snapshots.json');
const catalog = read('data/course-catalog.json');
const profile = read('department-profiles/design-v1.json');
const courses = Object.entries(profile.workload.appliedLearningCourses).map(([code, item]) => ({ code, ...item }));
const enrollment = EnrollmentViewModel.build(history, catalog, { year: 'all', snapshots, now: '2026-09-13T20:00:00Z' });
const build = (options = {}, integratedYears = {}, source = enrollment) => model.build({ enrollment: source, integratedYears, courses }, options);
const record = (courseCode, quarter, credits, workloadCredits, extra = {}) => ({ courseCode, quarter, credits, workloadCredits, ...extra });

describe('AppliedLearningViewModel registrations', () => {
    test('reconciles the actual Enrollment source and captures for all configured courses', () => {
        const result = build();
        expect(result.registrations.total).toBe(468);
        expect(Object.fromEntries(result.registrations.courses.map(course => [course.code, course.total]))).toEqual({
            'DESN 399': 21, 'DESN 491': 17, 'DESN 495': 165, 'DESN 499': 265
        });
        expect(result.registrations.provisionalQuarters).toEqual(['Fall 2026']);
        expect(result.workload.total).toBeNull();
        expect(result.workload.supervisorCount).toBeNull();
    });

    test('current Fall registration counts remain provisional and distinct from workload', () => {
        const result = build({ year: '2026-27', quarter: 'Fall' });
        expect(result.registrations.total).toBe(6);
        expect(result.registrations.quarters).toEqual([expect.objectContaining({
            key: 'fall-2026', academicYear: '2026-27', total: 6, provisional: true
        })]);
        expect(result.registrations.recordedQuarterCount).toBe(1);
        expect(result.workload.credits).toBeNull();
    });

    test('year and quarter use the academic-year boundary for both winter and fall', () => {
        const winter = build({ year: '2025-26', quarter: 'Winter' });
        expect(winter.registrations.quarters.map(quarter => quarter.key)).toEqual(['winter-2026']);
        const fall = build({ year: '2025-26', quarter: 'Fall' });
        expect(fall.registrations.quarters.map(quarter => quarter.key)).toEqual(['fall-2025']);
    });

    test('course selection filters every registration total without counting other courses', () => {
        const result = build({ course: 'DESN 495' });
        expect(result.registrations.total).toBe(165);
        expect(result.registrations.courses.map(course => course.code)).toEqual(['DESN 495']);
        expect(result.registrations.quarters.reduce((total, quarter) => total + (quarter.total || 0), 0)).toBe(165);
        expect(result.workload.courses.map(course => course.code)).toEqual(['DESN 495']);
    });

    test('preserves observed zero registrations and missing course-quarter gaps', () => {
        const fixture = EnrollmentViewModel.build({ courseStats: {
            'DESN 399': { quarterly: { 'fall-2025': 0 } },
            'DESN 100': { quarterly: { 'winter-2026': 25 } }
        } }, null, { year: 'all' });
        const result = build({ course: 'DESN 399' }, {}, fixture);
        expect(result.registrations.total).toBe(0);
        expect(result.registrations.quarters.map(quarter => quarter.total)).toEqual([0, null]);
        expect(result.registrations.courses[0].quarters.map(quarter => quarter.total)).toEqual([0, null]);
        expect(result.registrations.recordedQuarterCount).toBe(1);
        expect(build({ course: 'DESN 399', quarter: 'Winter' }, {}, fixture).registrations.total).toBeNull();
    });

    test('complete captures replace overlapping historical observations without adding them twice', () => {
        const capture = {
            schemaVersion: 1, terms: [{ quarter: 'winter-2026', academicYear: '2025-26', status: 'completed',
                observedAt: '2026-09-13T20:00:00Z', completeSearch: true, expectedSections: 2,
                sections: [
                    { course: 'DESN 499', title: 'Independent Study', section: '001', crn: '10001', capacity: 20, available: 18, waitlisted: 0 },
                    { course: 'DESN 499', title: 'Independent Study', section: '002', crn: '10002', capacity: 20, available: 17, waitlisted: 0 }
                ] }]
        };
        const fixture = EnrollmentViewModel.build({ courseStats: { 'DESN 499': { quarterly: { 'winter-2026': 99 } } } }, null, { year: 'all', snapshots: capture });
        expect(build({}, {}, fixture).registrations.total).toBe(5);
        const duplicate = JSON.parse(JSON.stringify(capture));
        duplicate.terms[0].sections[1].crn = '10001';
        expect(() => EnrollmentViewModel.build(history, catalog, { year: 'all', snapshots: duplicate })).toThrow(/duplicate/);
    });

    test('configured cohorts exclude ordinary courses and duplicate configuration entries', () => {
        const result = model.build({ enrollment, courses: [courses[0], courses[0]], integratedYears: {} });
        expect(result.registrations.courses).toHaveLength(1);
        expect(result.registrations.total).toBe(21);
        expect(build({ course: 'DESN 100' }).registrations.total).toBeNull();
    });

    test('empty or out-of-range registration sources stay unknown', () => {
        const empty = build({}, {}, {});
        expect(empty.registrations.total).toBeNull();
        expect(empty.registrations.courses.every(course => course.total === null)).toBe(true);
        expect(build({ year: '2030-31' }).registrations.total).toBeNull();
        expect(build({ year: '2030-31' }).registrations.recordedQuarterCount).toBe(0);
    });
});

describe('AppliedLearningViewModel workload', () => {
    beforeEach(() => {
        localStorage.clear();
        global.__PROGRAM_COMMAND_ACTIVE_PROFILE__ = profile;
        global.getYearData = () => ({ all: {}, fullTime: {}, adjunct: {}, former: {} });
    });
    afterEach(() => {
        localStorage.clear();
        delete global.__PROGRAM_COMMAND_ACTIVE_PROFILE__;
        delete global.getYearData;
    });

    function integratedFixture() {
        localStorage.setItem('programCommandAySetup', JSON.stringify({ '2026-27': { faculty: [
            { name: 'Faculty Taylor', role: 'Full Professor', annualTargetCredits: 36, releaseCredits: 0 }
        ] } }));
        localStorage.setItem('designSchedulerData_2026-27', JSON.stringify({
            fall: { MW: { '10:00-12:20': [
                { code: 'DESN 495', instructor: 'Faculty Taylor', credits: 10 },
                { code: 'DESN 100', instructor: 'Faculty Taylor', credits: 5 },
                { code: 'DESN 491', instructor: 'TBD', credits: 5 }
            ] } },
            winter: { TR: { '13:00-15:20': [{ code: 'DESN 499', instructor: 'Faculty Taylor', credits: 5 }] } },
            spring: {}
        }));
        WorkloadIntegration.saveFacultyWorkloadDetailEntries('2026-27', 'Faculty Taylor', [
            { id: 'detail-1', courseCode: 'DESN 499', quarter: 'Fall', studentCredits: 12, workloadRate: 0.3 }
        ]);
        return { '2026-27': WorkloadIntegration.buildIntegratedWorkloadYearData({}, '2026-27') };
    }

    test('real integration preserves weighted schedule and manual-detail rates, plus unresolved demand once', () => {
        const integratedYears = integratedFixture();
        const result = build({ year: '2026-27' }, integratedYears);
        expect(result.workload).toMatchObject({ total: 6.6, credits: 32, recordCount: 4, supervisorCount: 1, unassignedWorkload: 1 });
        expect(result.workload.faculty).toEqual([{ name: 'Faculty Taylor', credits: 27, workload: 5.6, recordCount: 3 }]);
        expect(result.workload.rows.find(row => row.source === 'faculty-detail-entry')).toMatchObject({
            quarter: 'Fall', credits: 12, workloadCredits: 3.6
        });
        expect(result.workload.rows.find(row => row.faculty === null)).toMatchObject({
            courseCode: 'DESN 491', credits: 5, workloadCredits: 1, source: 'unassigned-schedule'
        });
        expect(result.workload.rows).toHaveLength(4);
        expect(result.registrations.total).toBe(6);
    });

    test('real integration uses the same year, quarter and course filters for registration and workload', () => {
        const integratedYears = integratedFixture();
        const result = build({ year: '2026-27', quarter: 'Fall', course: 'DESN 499' }, integratedYears);
        expect(result.workload).toMatchObject({ total: 3.6, credits: 12, recordCount: 1, supervisorCount: 1, unassignedWorkload: 0 });
        expect(result.workload.rows.every(row => row.year === '2026-27' && row.quarter === 'Fall' && row.courseCode === 'DESN 499')).toBe(true);
        expect(result.registrations.courses.map(course => course.code)).toEqual(['DESN 499']);
        expect(result.registrations.quarters.map(quarter => quarter.key)).toEqual(['fall-2026']);
        const spring = build({ year: '2026-27', quarter: 'Spring' }, integratedYears);
        expect(spring.workload.total).toBeNull();
        expect(spring.workload.recordCount).toBeNull();
        expect(spring.registrations.total).toBeNull();
    });

    test('active CLSS override flows through the real integration without retaining replaced scheduler work', () => {
        integratedFixture();
        localStorage.setItem('programCommandClssWorkloadImport', JSON.stringify({ source: 'clss-import', mode: 'workloads', active: true,
            targetYear: '2026-27', overrideScheduler: true,
            rows: [{ courseCode: 'DESN 495', quarter: 'Spring', credits: 20, assignedFaculty: 'Faculty Taylor' }] }));
        const integratedYears = { '2026-27': WorkloadIntegration.buildIntegratedWorkloadYearData({}, '2026-27') };
        const result = build({ quarter: 'Spring' }, integratedYears);
        expect(result.workload).toMatchObject({ total: 2, credits: 20, recordCount: 1 });
        expect(build({ quarter: 'Winter' }, integratedYears).workload.total).toBeNull();
    });

    test('never reads summary students or applied-learning trend estimates as source records', () => {
        const integratedYears = { '2026-27': { all: { Taylor: { courses: [], appliedLearning: { 'DESN 499': { students: 40, workload: 100 } } } },
            appliedLearningTrends: { totalStudents: 999 }, meta: { unresolvedScheduleCourses: { totalWorkloadCredits: 100 } } } };
        const result = build({}, integratedYears);
        expect(result.workload).toMatchObject({ total: null, credits: null, recordCount: null, supervisorCount: null, unassignedWorkload: null });
        expect(result.registrations.total).toBe(468);
        expect(result.workload).not.toHaveProperty('students');
    });

    test('faculty dictionaries are not counted again when all and fullTime reference the same record', () => {
        const faculty = { facultyName: 'Taylor', courses: [record('DESN 495', 'Fall', 10, 1)] };
        const result = build({}, { '2026-27': { all: { Taylor: faculty }, fullTime: { Taylor: faculty } } });
        expect(result.workload.total).toBe(1);
        expect(result.workload.recordCount).toBe(1);
    });

    test('all years aggregates records while distinct supervisor names are counted once', () => {
        const result = build({}, {
            '2025-26': { all: { Taylor: { courses: [record('DESN 495', 'Fall', 10, 1)] } } },
            '2026-27': { all: { Taylor: { courses: [record('DESN 499', 'Fall', 10, 2)] } } }
        });
        expect(result.workload).toMatchObject({ total: 3, credits: 20, recordCount: 2, supervisorCount: 1 });
        expect(result.workload.faculty).toEqual([{ name: 'Taylor', workload: 3, credits: 20, recordCount: 2 }]);
    });

    test('groups course sections by faculty while keeping unassigned work separate', () => {
        const result = build({}, { '2026-27': {
            all: {
                Alpha: { courses: [record('DESN 495', 'Fall', 5, 0.5)] },
                Zeta: { courses: [record('DESN 495', 'Winter', 10, 1)] }
            },
            meta: { unresolvedScheduleCourses: { courses: [record('DESN 499', 'Spring', 6, 1.2)] } }
        } });
        expect(result.byCourseFaculty).toEqual([
            {
                courseCode: 'DESN 495', label: 'DESN 495', sections: 2, credits: 15,
                faculty: [
                    { name: 'Alpha', sections: 1, credits: 5, workload: 0.5 },
                    { name: 'Zeta', sections: 1, credits: 10, workload: 1 }
                ]
            },
            {
                courseCode: 'DESN 499', label: 'DESN 499', sections: 1, credits: 6,
                faculty: [{ name: 'Unassigned', sections: 1, credits: 6, workload: 1.2 }]
            }
        ]);
        expect(result.workload.supervisorCount).toBe(2);
    });

    test('only unassigned records imply zero named supervisors rather than a missing source', () => {
        const result = build({}, { '2026-27': { meta: { unresolvedScheduleCourses: {
            totalWorkloadCredits: 999, courses: [record('DESN 495', 'Fall', 10, 1)]
        } } } });
        expect(result.workload).toMatchObject({ total: 1, credits: 10, recordCount: 1, supervisorCount: 0, unassignedWorkload: 1 });
        expect(result.workload.faculty).toEqual([]);
    });

    test('explicit zero workload is preserved; missing credit values are never coerced to zero', () => {
        const zero = build({}, { '2026-27': { all: { Taylor: { courses: [record('DESN 499', 'Fall', 0, 0)] } } } });
        expect(zero.workload).toMatchObject({ total: 0, credits: 0, recordCount: 1, supervisorCount: 1 });
        const missing = build({}, { '2026-27': { all: { Taylor: { courses: [record('DESN 499', 'Fall', null, null)] } } } });
        expect(missing.workload).toMatchObject({ total: null, credits: null, recordCount: 1, missingMetricCount: 1 });
    });

    test('can calculate from an explicit record multiplier, but never substitutes a profile rate for missing workload', () => {
        const result = build({}, { '2026-27': { all: { Taylor: { courses: [
            { courseCode: 'DESN 499', quarter: 'Fall', credits: 10, multiplier: 0.3 }
        ] } } } });
        expect(result.workload.total).toBe(3);
        const unknown = build({}, { '2026-27': { all: { Taylor: { courses: [
            { courseCode: 'DESN 499', quarter: 'Fall', credits: 10 }
        ] } } } });
        expect(unknown.workload.total).toBeNull();
        expect(unknown.workload.credits).toBe(10);
    });

    test('ordinary courses stay excluded even when their summaries call them applied learning', () => {
        const result = build({}, { '2026-27': { all: { Taylor: { courses: [record('DESN 100', 'Fall', 5, 5, { type: 'applied-learning' })] } } } });
        expect(result.workload.total).toBeNull();
        expect(result.workload.rows).toEqual([]);
    });

    test('does not mutate real enrollment data, integration records, configuration or options', () => {
        const input = { enrollment, integratedYears: integratedFixture(), courses };
        const options = { year: 'all', quarter: 'Fall', course: 'all' };
        const before = JSON.stringify({ input, options });
        const result = model.build(input, options);
        result.workload.rows[0].faculty = 'Changed';
        result.registrations.courses[0].quarters[0].total = 9999;
        expect(JSON.stringify({ input, options })).toBe(before);
    });
});
