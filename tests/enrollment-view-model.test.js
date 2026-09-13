const fs = require('fs');
const path = require('path');
const model = require('../js/enrollment-view-model.js');

// The shipped fixture is intentionally tested: the old dashboard silently
// selected neighboring academic years and mislabeled estimated headcount.
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../enrollment-dashboard-data.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/course-catalog.json'), 'utf8'));

function sample(courseStats) {
    return { generatedAt: '2026-02-21T16:16:10.298Z', courseStats };
}

test('metadata selects the latest complete academic year and actual observation range', () => {
    const meta = model.create(fixture, catalog);
    expect(meta.defaultYear).toBe('2024-25');
    expect(meta.firstQuarter).toBe('Fall 2022');
    expect(meta.lastQuarter).toBe('Fall 2025');
    expect(meta.sourceDate).toBe(fixture.generatedAt);
    expect(meta.years[0]).toMatchObject({ value: '2025-26', complete: false, quarterKeys: ['fall-2025'] });
});

test.each([
    ['2022-23', 1229, 33, ['Fall 2022', 'Winter 2023', 'Spring 2023']],
    ['2023-24', 1169, 36, ['Fall 2023', 'Winter 2024', 'Spring 2024']],
    ['2024-25', 1272, 35, ['Fall 2024', 'Winter 2025', 'Spring 2025']],
    ['2025-26', 368, 18, ['Fall 2025']]
])('source registrations for %s use exact academic quarters', (year, registrations, courseCount, labels) => {
    const view = model.build(fixture, catalog, { year });
    expect(view.totalRegistrations).toBe(registrations);
    expect(view.courseCount).toBe(courseCount);
    expect(view.quarters.map(quarter => quarter.label)).toEqual(labels);
    expect(view.quarters.reduce((sum, quarter) => sum + quarter.total, 0)).toBe(registrations);
    expect(view.levelTotals.reduce((sum, level) => sum + level.total, 0)).toBe(registrations);
});

test('partial-year comparison only uses the same observed seasons in the previous year', () => {
    const view = model.build(fixture, catalog, { year: '2025-26' });
    expect(view.coverage).toMatchObject({ quarterCount: 1, complete: false, label: 'Fall only' });
    expect(view.comparison).toMatchObject({ current: 368, previous: 396, delta: -28, previousYear: '2024-25' });
    expect(view.comparison.quarters).toEqual([{ season: 'Fall', label: 'Fall', current: 368, previous: 396 }]);
    expect(view.comparison.percent).toBeCloseTo(-7.070707);
    expect(model.build(fixture, catalog, { year: '2024-25' }).comparison).toMatchObject({ current: 1272, previous: 1169, delta: 103 });
});

test('missing previous seasonal coverage never produces a partial comparison', () => {
    const data = sample({ 'DESN 100': { quarterly: { 'fall-2023': 10, 'fall-2024': 15, 'winter-2025': 20 } } });
    expect(model.build(data, null, { year: '2024-25' }).comparison).toBeNull();
    expect(model.build(fixture, catalog, { year: '2022-23' }).comparison).toBeNull();
    expect(model.build(fixture, catalog, { year: 'all' }).comparison).toBeNull();
});

test('level and historical trend filters apply consistently to table, totals, comparison and winter', () => {
    const data = sample({
        'DESN 100': { trend: 'growing', average: 8, peak: 13, quarterly: { 'winter-2024': 10, 'winter-2025': 15 } },
        'DESN 200': { trend: 'declining', quarterly: { 'winter-2024': 20, 'winter-2025': 10 } },
        'DESN 300': { trend: 'growing', quarterly: { 'winter-2024': 30, 'winter-2025': 35 } }
    });
    const view = model.build(data, { courses: [{ code: 'DESN 100', title: 'Drawing' }] }, { year: '2024-25', level: 'foundation', trend: 'growing' });
    expect(view.courses).toHaveLength(1);
    expect(view.courses[0]).toMatchObject({ code: 'DESN 100', title: 'Drawing', periodTotal: 15, average: 8, peak: 13, trend: 'growing' });
    expect(view.totalRegistrations).toBe(15);
    expect(view.quarters[0].total).toBe(15);
    expect(view.levelTotals.map(level => level.total)).toEqual([15, 0, 0]);
    expect(view.trendCounts.growing).toBe(1);
    expect(view.comparison).toMatchObject({ current: 15, previous: 10, delta: 5 });
    expect(view.winter).toMatchObject({ years: [2024, 2025], totals: [10, 15], rows: [{ code: 'DESN 100', values: [10, 15], delta: 5, percent: 50 }] });
});

test('winter history distinguishes a recorded zero from an unobserved course quarter', () => {
    const data = sample({
        'DESN 100': { quarterly: { 'winter-2023': 0, 'winter-2025': 12 } },
        'DESN 200': { quarterly: { 'winter-2024': 6, 'winter-2025': 0 } }
    });
    const view = model.build(data, null, { year: '2024-25' });
    expect(view.winter.years).toEqual([2023, 2024, 2025]);
    expect(view.winter.rows[0]).toMatchObject({ values: [0, null, 12], delta: 12, percent: null });
    expect(view.winter.rows[1]).toMatchObject({ values: [null, 6, 0], delta: null, percent: null });
    expect(view.winter.totals).toEqual([0, 6, 12]);
    expect(model.build(data, null, { year: '2022-23' }).winter).toEqual(view.winter);
    expect(model.build(data, null, { year: 'all' }).courses.find(course => course.code === 'DESN 100').quarterly['winter-2024']).toBeNull();
});

test('summer belongs to the ending academic year and is counted separately from the three core quarters', () => {
    const data = sample({ 'DESN 100': { quarterly: {
        'fall-2025': 50, 'spring-2025': 30, 'fall-2024': 10, 'summer-2025': 40, 'winter-2025': 20
    } } });
    const view = model.build(data, null, { year: '2024-25' });
    expect(view.quarters.map(quarter => quarter.label)).toEqual(['Fall 2024', 'Winter 2025', 'Spring 2025', 'Summer 2025']);
    expect(view.totalRegistrations).toBe(100);
    expect(view.coverage).toMatchObject({ quarterCount: 4, coreQuarterCount: 3, summerQuarterCount: 1, complete: true });
});

test('invalid counts are rejected instead of becoming zero or fabricated enrollment', () => {
    const data = sample({
        'DESN 100': { quarterly: { 'fall-2024': null, 'winter-2025': '10', 'spring-2025': -2, 'summer-2025': NaN } },
        'DESN 200': { quarterly: { 'fall-2024': 0, 'winter-2025': Infinity, 'spring-2025': 1.5, 'autumn-2025': 2 } },
        'DESN 300': null
    });
    const view = model.build(data);
    expect(view.courses.map(course => course.code)).toEqual(['DESN 200']);
    expect(view.quarters).toHaveLength(1);
    expect(view.totalRegistrations).toBe(0);
    expect(view.hasData).toBe(true);
});

test.each([null, undefined, [], {}, { courseStats: null }, { courseStats: [] }])('malformed source %p has an intentional no-data state', data => {
    expect(model.create(data)).toMatchObject({ years: [], defaultYear: 'all', firstQuarter: null, lastQuarter: null });
    expect(model.build(data)).toMatchObject({ hasData: false, courses: [], quarters: [], totalRegistrations: 0, comparison: null });
});

test('building a view does not mutate source ordering or source fields', () => {
    const before = JSON.stringify(fixture);
    model.build(fixture, catalog, { year: '2024-25', trend: 'growing' });
    expect(JSON.stringify(fixture)).toBe(before);
});

test('filtered quarters with no records remain gaps and cannot produce a prior-year comparison', () => {
    const view = model.build(fixture, catalog, { year: '2024-25', level: 'advanced', trend: 'growing' });
    expect(view.quarters.map(quarter => quarter.total)).toEqual([null, 21, null]);
    expect(view.totalRegistrations).toBe(21);
    expect(view.comparison).toBeNull();
    expect(view.winter.totals).toEqual([null, null, 21]);
});

test('recorded zero remains a valid observation in a seasonal comparison', () => {
    const data = sample({ 'DESN 100': { quarterly: { 'winter-2024': 0, 'winter-2025': 10 } } });
    const view = model.build(data, null, { year: '2024-25' });
    expect(view.comparison).toMatchObject({ current: 10, previous: 0, delta: 10, percent: null });
    expect(view.winter.totals).toEqual([0, 10]);
});
