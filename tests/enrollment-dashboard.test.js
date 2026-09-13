const fs = require('fs');
const path = require('path');
const vm = require('vm');
const model = require('../js/enrollment-view-model.js');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const source = JSON.parse(read('enrollment-dashboard-data.json'));
const catalog = JSON.parse(read('data/course-catalog.json'));
const calendar = JSON.parse(read('data/academic-calendar.json'));
const html = read('enrollment-dashboard.html');
const controller = read('pages/enrollment-dashboard.js');
let dashboard, Chart, fetchJson, errors, events, checkPeriod;
const byId = id => document.getElementById(id);

beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-02-01T20:00:00Z'));
    document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1];
    Chart = jest.fn().mockImplementation(() => ({ destroy: jest.fn() }));
    fetchJson = jest.fn(async url => ({ ok: true, json: async () => url === 'data/academic-calendar.json' ? calendar : url === 'data/course-catalog.json' ? catalog : source }));
    errors = jest.fn();
    events = {};
    const context = vm.createContext({
        window: { EnrollmentViewModel: model, Chart, addEventListener: (name, callback) => { events[name] = callback; }, setInterval: callback => { checkPeriod = callback; } },
        document, Date, fetch: fetchJson, console: { error: errors }
    });
    dashboard = vm.runInContext(`${controller}\nEnrollmentDashboard;`, context);
});

afterEach(() => { jest.useRealTimers(); });

function select(id, value) {
    byId(id).value = value;
    byId(id).dispatchEvent(new Event('change'));
}

test('default presentation shows all recorded years with automatic quarter comparisons', async () => {
    await dashboard.init();
    expect(byId('academicYearFilter').value).toBe('all');
    expect(byId('quarterFocus').value).toBe('current');
    expect(byId('registrationCount').textContent).toBe('4,038');
    expect(byId('periodChange').textContent).toBe('—');
    expect(byId('sourceCoverage').textContent).toBe('Records through Fall 2025');
    expect(byId('historyTakeaway').textContent).toContain('395 in 2024 to 437 in 2025, up 42 (10.6%)');
    expect(byId('historySmallMultiples').children).toHaveLength(12);
    expect(byId('historyTableBody').children).toHaveLength(31);
    expect(byId('historySmallMultiples').textContent).not.toContain('2026');
    expect(byId('main').getAttribute('aria-busy')).toBe('false');
});

test('successive filters replace the chart and keep partial-year comparisons aligned', async () => {
    await dashboard.init();
    const original = Chart.mock.results[0].value;
    select('academicYearFilter', '2025-26');
    expect(original.destroy).toHaveBeenCalledTimes(1);
    expect(byId('registrationCount').textContent).toBe('368');
    expect(byId('periodChange').textContent).toBe('−7.1%');
    expect(Chart.mock.calls[1][1].data.datasets.map(dataset => dataset.data)).toEqual([[368], [396]]);
    select('courseFilter', 'advanced');
    select('trendFilter', 'growing');
    expect(Chart.mock.results[1].value.destroy).toHaveBeenCalledTimes(1);
    expect(byId('registrationCount').textContent).toBe('—');
    expect(byId('periodOverview').hidden).toBe(true);
    expect(byId('courseDetails').hidden).toBe(true);
    expect(byId('history-comparison').hidden).toBe(false);
    expect(byId('historySmallMultiples').textContent).toContain('DESN 401');
    expect(byId('historyTakeaway').textContent).toContain('No matching records are available for Winter 2024');
});

test('no matching quarter records are shown as gaps and never explained as a decline to zero', async () => {
    await dashboard.init();
    select('academicYearFilter', '2024-25');
    select('courseFilter', 'advanced');
    select('trendFilter', 'growing');
    const config = Chart.mock.calls[Chart.mock.calls.length - 1][1];
    expect(config.data.datasets).toHaveLength(1);
    expect(config.data.datasets[0].data).toEqual([null, 21, null]);
    expect(byId('quarterTableBody').textContent).toContain('—');
    expect(byId('periodChange').textContent).toBe('—');
    expect(byId('quarterTakeaway').textContent).toContain('Winter 2025');
    const ctx = { save: jest.fn(), restore: jest.fn(), fillText: jest.fn() };
    config.plugins[0].afterDatasetsDraw({ ctx, getDatasetMeta: () => ({ data: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }] }) });
    expect(ctx.fillText).toHaveBeenCalledTimes(1);
    expect(ctx.fillText.mock.calls[0][0]).toBe('21');
});

test('source failure hides stale totals and retry restores the dashboard', async () => {
    await dashboard.init();
    fetchJson.mockRejectedValueOnce(new Error('Offline'));
    await dashboard.init();
    expect(byId('dashboardContent').hidden).toBe(true);
    expect(byId('loadStatus').hidden).toBe(false);
    expect(byId('loadStatus').textContent).toContain('No totals are shown');
    expect(byId('academicYearFilter').disabled).toBe(true);
    expect(byId('loadStatus').querySelector('button').textContent).toBe('Try again');
    await dashboard.init();
    expect(byId('dashboardContent').hidden).toBe(false);
    expect(byId('loadStatus').hidden).toBe(true);
    expect(byId('academicYearFilter').disabled).toBe(false);
    expect(byId('registrationCount').textContent).toBe('4,038');
});

test('chart rendering failure exposes the error state instead of stale partial content', async () => {
    Chart.mockImplementationOnce(() => { throw new Error('Canvas unavailable'); });
    await dashboard.init();
    expect(byId('loadStatus').hidden).toBe(false);
    expect(byId('dashboardContent').hidden).toBe(true);
    expect(errors).toHaveBeenCalled();
});

test('missing Chart library keeps exact table counts and Winter charts available', async () => {
    const context = vm.createContext({
        window: { EnrollmentViewModel: model, addEventListener: jest.fn(), setInterval: jest.fn() },
        document, Date, fetch: fetchJson, console: { error: errors }
    });
    await vm.runInContext(`${controller}\nEnrollmentDashboard;`, context).init();
    expect(byId('chartUnavailable').hidden).toBe(false);
    expect(byId('quarterTableBody').textContent).toContain('437');
    expect(byId('historySmallMultiples').querySelectorAll('svg')).toHaveLength(12);
    expect(errors).not.toHaveBeenCalled();
});

test('automatic view follows the upcoming quarter and displays the source gap', async () => {
    jest.setSystemTime(new Date('2026-09-13T20:00:00Z'));
    await dashboard.init();
    select('academicYearFilter', 'current');
    expect(byId('currentTermLabel').textContent).toBe('Upcoming quarter · Fall 2026 starts Sep 23');
    expect(byId('academicYearFilter').selectedOptions[0].textContent).toBe('Automatic · 2026–27');
    expect(byId('periodStatus').textContent).toContain('No enrollment records for Fall 2026');
    expect(byId('registrationCount').textContent).toBe('—');
    expect(byId('historyHeading').textContent).toBe('Fall enrollment, course by course');
    expect(byId('historyScope').textContent).toContain('Fall 2022–2025');
    expect(byId('historyTableHead').textContent).not.toContain('Winter');
});

test('open page rolls to a new term while explicit year and quarter choices stay selected', async () => {
    jest.setSystemTime(new Date('2026-12-10T20:00:00Z'));
    await dashboard.init();
    expect(byId('historyHeading').textContent).toContain('Fall');
    jest.setSystemTime(new Date('2026-12-11T20:00:00Z'));
    events.focus();
    expect(byId('historyHeading').textContent).toContain('Winter');
    expect(byId('academicYearFilter').value).toBe('all');
    expect(byId('registrationCount').textContent).toBe('4,038');
    expect(byId('currentTermLabel').textContent).toContain('Upcoming quarter · Winter 2027');
    select('academicYearFilter', '2024-25');
    select('quarterFocus', 'spring');
    jest.setSystemTime(new Date('2027-01-04T20:00:00Z'));
    checkPeriod();
    expect(byId('currentTermLabel').textContent).toBe('Current quarter · Winter 2027');
    expect(byId('academicYearFilter').value).toBe('2024-25');
    expect(byId('registrationCount').textContent).toBe('1,272');
    expect(byId('quarterFocus').value).toBe('spring');
    expect(byId('historyHeading').textContent).toContain('Spring');
    select('quarterFocus', 'current');
    expect(byId('historyHeading').textContent).toContain('Winter');
});

test('Summer has an honest empty state and missing calendar uses a labeled estimate', async () => {
    jest.setSystemTime(new Date('2028-07-10T20:00:00Z'));
    fetchJson.mockImplementation(async url => {
        if (url === 'data/academic-calendar.json') throw new Error('Calendar unavailable');
        return { ok: true, json: async () => url.startsWith('data/') ? catalog : source };
    });
    await dashboard.init();
    expect(byId('currentTermLabel').textContent).toBe('Seasonal estimate · Summer 2028');
    expect(byId('periodStatus').textContent).toContain('Published term dates are unavailable');
    expect(byId('historyEmpty').hidden).toBe(false);
    expect(byId('historySmallMultiples').children).toHaveLength(0);
    expect(byId('historyDetails').hidden).toBe(true);
    expect(errors).not.toHaveBeenCalled();
});
