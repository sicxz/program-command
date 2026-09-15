const fs = require('fs');
const path = require('path');
const vm = require('vm');
const model = require('../js/capacity-view-model.js');
const enrollment = require('../js/enrollment-view-model.js');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const html = read('pages/capacity-planning-dashboard.html');
const controller = read('pages/capacity-planning-dashboard.js');
const history = JSON.parse(read('enrollment-dashboard-data.json'));
const workload = JSON.parse(read('workload-data.json'));
const calendar = JSON.parse(read('data/academic-calendar.json'));
const byId = id => document.getElementById(id);
let dashboard, events, interval, sourceByYear, targetByYear, fetchJson, profile;
const course = (quarter, workloadCredits, extra = {}) => ({ courseCode: 'DESN 100', credits: workloadCredits, workloadCredits, quarter, ...extra });

beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-13T20:00:00Z'));
    document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1];
    sourceByYear = {};
    targetByYear = {};
    events = {};
    fetchJson = jest.fn(async url => ({ ok: true, json: async () => url.includes('academic-calendar') ? calendar : url.includes('enrollment-dashboard') ? history : workload }));
    profile = {
        initialize: jest.fn(async () => ({})),
        getStoredProfileId: () => 'ewu-design', getActiveProfileId: () => 'ewu-design',
        ACTIVE_PROFILE_STORAGE_KEY: 'programCommandActiveDepartmentProfileId',
        CUSTOM_PROFILES_STORAGE_KEY: 'programCommandCustomDepartmentProfilesV1'
    };
    const context = vm.createContext({
        document, Date, fetch: fetchJson, console: { error: jest.fn() },
        CapacityViewModel: model, EnrollmentViewModel: enrollment, DepartmentProfileManager: profile,
        WorkloadIntegration: {
            getAcademicYearOptions: () => ['2025-26', '2026-27'],
            normalizeNameKey: name => String(name || '').trim().toLowerCase(),
            getAppliedLearningCourseConfig: () => ({ 'DESN 499': { title: 'Independent Study', rate: 0.2 } }),
            getProgramCommandScheduleCourses: year => {
                const source = sourceByYear[year] || {};
                const assigned = Object.values(source.all || {}).flatMap(record => (record.courses || []).map(item => ({
                    ...item, assignedFaculty: record.facultyName, category: record.category
                })));
                const unassigned = (source.meta?.unresolvedScheduleCourses?.courses || []).map(item => ({ ...item, assignedFaculty: 'TBD' }));
                return [...assigned, ...unassigned];
            },
            buildIntegratedWorkloadYearData: (data, year) => targetByYear[year] || {
                all: {}, meta: { fallbackTargetRulesApplied: [] }
            }
        },
        window: { addEventListener: (name, handler) => { events[name] = handler; }, setInterval: handler => { interval = handler; } }
    });
    dashboard = vm.runInContext(`${controller}\nCapacityDashboard;`, context);
});
afterEach(() => jest.useRealTimers());
function select(id, value) {
    byId(id).value = value;
    byId(id).dispatchEvent(new Event('change'));
}
function addDraft() {
    sourceByYear['2026-27'] = {
        all: { 'Faculty Example': {
            facultyName: 'Faculty Example', category: 'fullTime', ayActive: true,
            ayTargetCredits: 36, ayReleaseCredits: 9, ayNetTargetCredits: 27,
            courses: [course('Fall', 15), course('Winter', 15), course('Fall', 1, { courseCode: 'DESN 499', credits: 5, multiplier: 0.2, type: 'applied-learning' })]
        } },
        meta: { hasLiveSchedule: true, ayFaculty: 1, unresolvedScheduleCourses: { courses: [course('Fall', 5, { section: '01' })] } }
    };
    targetByYear['2026-27'] = {
        all: { 'Faculty Example': {
            facultyName: 'Faculty Example', category: 'fullTime', ayActive: true,
            ayTargetCredits: 36, ayReleaseCredits: 9, ayNetTargetCredits: 27
        } },
        meta: { fallbackTargetRulesApplied: [] }
    };
}

test('defaults to all years and does not describe empty historical records as spare capacity', async () => {
    await dashboard.init();
    expect(byId('academicYearFilter').value).toBe('all');
    expect(byId('metric2Value').textContent).toBe('0');
    expect(byId('yearTableBody').textContent).toContain('324');
    expect(byId('yearTableBody').textContent).toContain('Recorded target · releases unverified');
    expect(byId('yearTableBody').textContent).toContain('Not recorded');
    expect(byId('readingDetail').textContent).toContain('cannot be determined');
    expect(byId('main').getAttribute('aria-busy')).toBe('false');
    select('academicYearFilter', '2025-26');
    expect(byId('grossTarget').textContent).toBe('324');
    expect(byId('netTarget').textContent).toBe('—');
    expect(byId('metric2Value').textContent).toBe('—');
});

test('period and applied-learning controls change weighted demand and unassigned teaching consistently', async () => {
    addDraft(); await dashboard.init();
    select('academicYearFilter', 'current');
    expect(byId('metric1Value').textContent).toBe('27');
    expect(byId('metric2Value').textContent).toBe('36');
    expect(byId('metric3Value').textContent).toBe('5');
    expect(byId('metric4Value').textContent).toBe('4');
    expect(byId('sourceCoverage').textContent).toBe('Course records · 2026–27');
    expect(byId('facultyBars').textContent).toContain('1 applied-learning section · 1 weighted credit');
    select('quarterFilter', 'current');
    expect(byId('metric2Value').textContent).toBe('21');
    expect(byId('metric4Label').textContent).toBe('Workload records');
    expect(byId('metric4Value').textContent).toBe('3');
    expect(byId('facultyReading').textContent).toContain('no quarter capacity');
    select('includeAppliedLearning', 'no');
    expect(byId('metric2Value').textContent).toBe('20');
    expect(byId('metric4Value').textContent).toBe('2');
    select('quarterFilter', 'Spring');
    expect(byId('metric2Value').textContent).toBe('—');
    expect(byId('unassignedPanel').hidden).toBe(true);
    expect(byId('readingHeading').textContent).toContain('No workload records for Spring');
});

test('saved course records retain the preliminary roster target when AY Setup is missing', async () => {
    sourceByYear['2026-27'] = {
        all: { 'Travis Masingale': {
            facultyName: 'Travis Masingale', category: 'fullTime',
            courses: [course('Fall', 5)]
        } },
        meta: { hasLiveSchedule: true }
    };
    targetByYear['2026-27'] = {
        all: { 'Travis Masingale': {
            facultyName: 'Travis Masingale', category: 'fullTime', rank: 'Full Professor',
            ayRole: 'Full Professor', ayActive: true, ayTargetCredits: 36,
            ayReleaseCredits: 0, ayNetTargetCredits: 36, ayReleaseReason: ''
        } },
        meta: { fallbackTargetRulesApplied: [{ matchedFaculty: ['Travis Masingale'] }] }
    };

    await dashboard.init();
    select('academicYearFilter', 'current');

    expect(byId('grossTarget').textContent).toBe('36');
    expect(byId('netTarget').textContent).toBe('36');
});

test('AY Setup targets stay authoritative without saved course records', async () => {
    targetByYear['2025-26'] = {
        all: {
            'Travis Masingale': {
                facultyName: 'Travis Masingale', category: 'fullTime', ayActive: true,
                ayTargetCredits: 36, ayReleaseCredits: 9, ayNetTargetCredits: 27
            },
            'Colin Manikoth': {
                facultyName: 'Colin Manikoth', category: 'fullTime', ayActive: true,
                ayTargetCredits: 36, ayReleaseCredits: 0, ayNetTargetCredits: 36
            }
        },
        meta: { ayFaculty: 2, fallbackTargetRulesApplied: [] }
    };

    await dashboard.init();
    select('academicYearFilter', '2025-26');

    expect(byId('grossTarget').textContent).toBe('72');
    expect(byId('netTarget').textContent).toBe('63');
    expect(byId('facultyTableBody').children).toHaveLength(2);
    expect(byId('facultyTableBody').textContent).toContain('Travis Masingale');
    expect(byId('facultyTableBody').textContent).toContain('Colin Manikoth');
    expect(byId('facultyTableBody').textContent).not.toContain('Melinda Breen');
});

test('all-year quarter filter uses the same scope without summing annual targets', async () => {
    addDraft(); await dashboard.init(); select('quarterFilter', 'Winter');
    expect(byId('yearTableBody').firstChild.textContent).toContain('15');
    expect(byId('yearWorkloadHeading').textContent).toBe('Winter workload');
    expect(byId('yearsScope').textContent).toContain('Winter workload in each academic year');
    byId('yearTableBody').querySelector('button').click();
    expect(byId('academicYearFilter').value).toBe('2026-27');
    expect(byId('metric2Value').textContent).toBe('15');
});

test('automatic year and quarter update after Pacific date change, while explicit selections remain', async () => {
    addDraft(); await dashboard.init(); select('academicYearFilter', 'current'); select('quarterFilter', 'current');
    jest.setSystemTime(new Date('2027-01-15T20:00:00Z')); interval();
    expect(byId('metric2Label').textContent).toBe('Winter workload');
    expect(byId('metric2Value').textContent).toBe('15');
    select('quarterFilter', 'Fall');
    jest.setSystemTime(new Date('2027-04-15T20:00:00Z')); interval();
    expect(byId('metric2Label').textContent).toBe('Fall workload');
});

test('source failure hides stale totals and supports retry', async () => {
    await dashboard.init(); fetchJson.mockRejectedValue(new Error('Offline'));
    await dashboard.init();
    expect(byId('dashboardContent').hidden).toBe(true);
    expect(byId('loadStatus').textContent).toContain('No totals are shown');
    expect(byId('loadStatus').querySelector('button').textContent).toBe('Try again');
    expect(byId('academicYearFilter').disabled).toBe(true);
});

test('profile storage change reloads the active profile instead of cached targets', async () => {
    await dashboard.init();
    await events.storage({ key: profile.ACTIVE_PROFILE_STORAGE_KEY });
    expect(profile.initialize).toHaveBeenLastCalledWith({ forceReload: true });
    await Promise.resolve();
});

test('faculty names render as text and auth guard remains included', async () => {
    addDraft(); sourceByYear['2026-27'].all['Faculty Example'].facultyName = '<img src=x onerror=alert(1)>';
    await dashboard.init(); select('academicYearFilter', 'current');
    expect(byId('facultyBars').querySelector('img')).toBeNull();
    expect(byId('facultyBars').textContent).toContain('<img');
    expect(html).toContain('../js/auth-guard.js');
});
