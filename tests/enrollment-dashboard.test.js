const fs = require('fs');
const path = require('path');
const vm = require('vm');
const model = require('../js/enrollment-view-model.js');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const source = JSON.parse(read('enrollment-dashboard-data.json'));
const catalog = JSON.parse(read('data/course-catalog.json'));
const html = read('enrollment-dashboard.html');
const controller = read('pages/enrollment-dashboard.js');
let dashboard, Chart, fetchJson, errors;
const byId = id => document.getElementById(id);

beforeEach(() => {
    document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1];
    Chart = jest.fn().mockImplementation(() => ({ destroy: jest.fn() }));
    fetchJson = jest.fn(async url => ({ ok: true, json: async () => url.startsWith('data/') ? catalog : source }));
    errors = jest.fn();
    const context = vm.createContext({
        window: { EnrollmentViewModel: model, Chart, addEventListener: jest.fn() },
        document, fetch: fetchJson, console: { error: errors }
    });
    dashboard = vm.runInContext(`${controller}\nEnrollmentDashboard;`, context);
});

function select(id, value) {
    byId(id).value = value;
    byId(id).dispatchEvent(new Event('change'));
}

test('default presentation uses recorded registrations, dates and real winters', async () => {
    await dashboard.init();
    expect(byId('academicYearFilter').value).toBe('2024-25');
    expect(byId('registrationCount').textContent).toBe('1,272');
    expect(byId('periodChange').textContent).toBe('+8.8%');
    expect(byId('sourceCoverage').textContent).toBe('Records through Fall 2025');
    expect(byId('winterTakeaway').textContent).toContain('395 in 2024 to 437 in 2025, up 42 (10.6%)');
    expect(byId('winterSmallMultiples').children).toHaveLength(12);
    expect(byId('winterTableBody').children).toHaveLength(31);
    expect(byId('winterSmallMultiples').textContent).not.toContain('2026');
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
    expect(byId('winter-comparison').hidden).toBe(false);
    expect(byId('winterSmallMultiples').textContent).toContain('DESN 401');
    expect(byId('winterTakeaway').textContent).toContain('No matching records are available for Winter 2024');
});

test('no matching quarter records are shown as gaps and never explained as a decline to zero', async () => {
    await dashboard.init();
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
    expect(byId('registrationCount').textContent).toBe('1,272');
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
        window: { EnrollmentViewModel: model, addEventListener: jest.fn() },
        document, fetch: fetchJson, console: { error: errors }
    });
    await vm.runInContext(`${controller}\nEnrollmentDashboard;`, context).init();
    expect(byId('chartUnavailable').hidden).toBe(false);
    expect(byId('quarterTableBody').textContent).toContain('437');
    expect(byId('winterSmallMultiples').querySelectorAll('svg')).toHaveLength(12);
    expect(errors).not.toHaveBeenCalled();
});
