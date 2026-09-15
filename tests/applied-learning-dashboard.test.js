const fs = require('fs');
const path = require('path');
const vm = require('vm');
const EnrollmentViewModel = require('../js/enrollment-view-model.js');
const CapacityViewModel = require('../js/capacity-view-model.js');
const AppliedLearningViewModel = require('../js/applied-learning-view-model.js');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const json = name => JSON.parse(read(name));
const html = read('pages/applied-learning-dashboard.html');
const controller = read('pages/applied-learning-dashboard.js');
const data = {
    '../enrollment-dashboard-data.json': json('enrollment-dashboard-data.json'),
    '../workload-data.json': json('workload-data.json'),
    '../data/course-catalog.json': json('data/course-catalog.json'),
    '../data/academic-calendar.json': json('data/academic-calendar.json'),
    '../data/enrollment-registration-snapshots.json': json('data/enrollment-registration-snapshots.json')
};
const config = [
    { code: 'DESN 399', title: 'Independent Study', rate: 0.2 }, { code: 'DESN 491', title: 'Senior Project', rate: 0.2 },
    { code: 'DESN 495', title: 'Internship', rate: 0.1 }, { code: 'DESN 499', title: 'Independent Study', rate: 0.2 }
];
const byId = id => document.getElementById(id);
let dashboard, events, interval, fetchJson, integratedYears, profile;

beforeEach(() => {
    jest.useFakeTimers(); jest.setSystemTime(new Date('2026-09-13T20:00:00Z'));
    document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1];
    events = {}; integratedYears = {};
    fetchJson = jest.fn(async url => ({ ok: true, json: async () => data[url] }));
    profile = {
        initialize: jest.fn(async () => ({})), getStoredProfileId: () => 'ewu-design', getActiveProfileId: () => 'ewu-design',
        ACTIVE_PROFILE_STORAGE_KEY: 'programCommandActiveDepartmentProfileId', CUSTOM_PROFILES_STORAGE_KEY: 'programCommandCustomDepartmentProfilesV1'
    };
    const context = vm.createContext({
        document, Date, EnrollmentViewModel, CapacityViewModel, AppliedLearningViewModel,
        DepartmentProfileManager: profile, fetch: fetchJson, console: { error: jest.fn() },
        WorkloadIntegration: { getAppliedLearningCourses: () => config, getAcademicYearOptions: () => ['2025-26','2026-27'], buildIntegratedWorkloadYearData: (source, year) => integratedYears[year] || source.workloadByYear.byYear[year] },
        window: { addEventListener: (name, callback) => { events[name] = callback; }, setInterval: callback => { interval = callback; } }
    });
    dashboard = vm.runInContext(`${controller}\nAppliedLearningDashboard;`, context);
});
afterEach(() => jest.useRealTimers());
function select(id, value) { byId(id).value = value; byId(id).dispatchEvent(new Event('change')); }
function addWorkload() {
    integratedYears['2026-27'] = { all: { 'Faculty Example': { courses: [
        { courseCode: 'DESN 495', quarter: 'Fall', credits: 5, workloadCredits: 0.5, source: 'faculty-detail-entry' },
        { courseCode: 'DESN 499', quarter: 'Winter', credits: 10, workloadCredits: 2, source: 'program-command-schedule' }
    ] } }, meta: { hasLiveSchedule: true, unresolvedScheduleCourses: { courses: [
        { courseCode: 'DESN 495', quarter: 'Fall', credits: 5, workloadCredits: 0.5 }
    ] } } };
}

test('all recorded years shows sourced registrations, provisional context and unavailable supervision', async () => {
    await dashboard.init(); select('academicYearFilter', 'all');
    expect(byId('academicYearFilter').value).toBe('all');
    expect(byId('quarterFilter').value).toBe('annual');
    expect(byId('registrationCount').textContent).toBe('468');
    expect(byId('courseCount').textContent).toBe('4');
    expect(byId('quarterCount').textContent).toBe('13');
    expect(byId('workloadCount').textContent).toBe('—');
    expect(byId('provisionalNote').textContent).toContain('Fall 2026');
    expect(byId('supervisionEmpty').hidden).toBe(false);
    expect(byId('main').getAttribute('aria-busy')).toBe('false');
});

test('academic year defaults to the current year when no selection was previously made', async () => {
    await dashboard.init();
    expect(byId('academicYearFilter').value).toBe('current');
    expect(byId('quarterScope').textContent).toContain('2026–27');
});

test('year, quarter and course filter both registrations and actual supervision records', async () => {
    addWorkload(); await dashboard.init(); select('academicYearFilter', 'current'); select('quarterFilter', 'current');
    expect(byId('registrationCount').textContent).toBe('6');
    expect(byId('workloadCount').textContent).toBe('1');
    expect(byId('unassignedCredits').textContent).toBe('0.5');
    expect(byId('workloadRecords').textContent).toBe('2');
    expect(byId('courseFacultyDrilldown').children).toHaveLength(1);
    expect(byId('courseFacultyDrilldown').textContent).toContain('DESN 495 · 2 sections · 10 credits');
    expect(byId('courseFacultyDrilldown').textContent).toContain('Unassigned');
    select('courseFilter', 'DESN 495');
    expect(byId('registrationCount').textContent).toBe('3');
    expect(byId('workloadCount').textContent).toBe('1');
    expect(byId('courseCards').children).toHaveLength(1);
    select('quarterFilter', 'Winter');
    expect(byId('registrationCount').textContent).toBe('—');
    expect(byId('workloadCount').textContent).toBe('—');
    expect(byId('supervisionContent').hidden).toBe(true);
    select('courseFilter', 'DESN 499');
    expect(byId('workloadCount').textContent).toBe('2');
    expect(byId('registrationCount').textContent).toBe('—');
});

test('explicit captured zero remains zero while absent records remain unavailable', async () => {
    await dashboard.init(); select('academicYearFilter','2026-27'); select('quarterFilter','Fall'); select('courseFilter','DESN 491');
    expect(byId('registrationCount').textContent).toBe('0');
    expect(byId('quarterEmpty').hidden).toBe(true);
    expect(byId('workloadCount').textContent).toBe('—');
    select('courseFilter','DESN 399');
    expect(byId('registrationCount').textContent).toBe('—');
});

test('automatic quarter follows the calendar while explicit quarter is preserved', async () => {
    await dashboard.init(); select('quarterFilter','current');
    expect(byId('quarterScope').textContent).toContain('Fall');
    jest.setSystemTime(new Date('2027-01-15T20:00:00Z')); interval();
    expect(byId('quarterScope').textContent).toContain('Winter');
    select('quarterFilter','Spring');
    jest.setSystemTime(new Date('2027-09-15T20:00:00Z')); interval();
    expect(byId('quarterScope').textContent).toContain('Spring');
});

test('missing captures produce a warning and the historical registration total', async () => {
    fetchJson.mockImplementation(async url => ({ ok: !url.includes('snapshots'), json: async () => data[url] }));
    await dashboard.init(); select('academicYearFilter', 'all');
    expect(byId('registrationCount').textContent).toBe('412');
    expect(byId('sourceWarning').hidden).toBe(false);
    expect(byId('provisionalNote').hidden).toBe(true);
});

test('total source failure hides stale values and offers retry', async () => {
    await dashboard.init(); fetchJson.mockRejectedValue(new Error('Offline')); await dashboard.init();
    expect(byId('dashboardContent').hidden).toBe(true);
    expect(byId('academicYearFilter').disabled).toBe(true);
    expect(byId('loadStatus').textContent).toContain('No totals are shown');
    expect(byId('loadStatus').querySelector('button').textContent).toBe('Try again');
});

test('profile changes force reload and workload names are escaped', async () => {
    addWorkload(); integratedYears['2026-27'].all['<img src=x onerror=alert(1)>'] = integratedYears['2026-27'].all['Faculty Example'];
    delete integratedYears['2026-27'].all['Faculty Example']; await dashboard.init();
    expect(byId('facultyBars').querySelector('img')).toBeNull();
    expect(byId('facultyBars').textContent).toContain('<img');
    await events.storage({ key: profile.ACTIVE_PROFILE_STORAGE_KEY });
    expect(profile.initialize).toHaveBeenLastCalledWith({ forceReload: true });
    expect(html).toContain('../js/auth-guard.js');
});

test('invalid capture bundle is quarantined without hiding healthy historical registrations', async () => {
    fetchJson.mockImplementation(async url => ({ ok: true, json: async () => url.includes('snapshots') ? { schemaVersion: 1, terms: [{}] } : data[url] }));
    await dashboard.init(); select('academicYearFilter', 'all');
    expect(byId('registrationCount').textContent).toBe('412');
    expect(byId('dashboardContent').hidden).toBe(false);
    expect(byId('sourceWarning').textContent).toContain('registration captures could not be loaded');
});
