const fs = require('fs');
const path = require('path');
const model = require('../js/enrollment-view-model.js');

const calendar = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/academic-calendar.json'), 'utf8'));
const now = new Date('2026-09-16T12:00:00-07:00');

function snapshot(quarter, ...counts) {
    return {
        quarter,
        academicYear: quarter === 'fall-2026' ? '2026-27' : '2025-26',
        status: 'provisional',
        sections: counts.map(enrolled => ({ enrolled }))
    };
}

test('DESN 326 style growth is registering before the latest term starts', () => {
    expect(model.computeTrend({
        history: { 'fall-2025': 16 },
        current: snapshot('fall-2026', 10, 14),
        calendar,
        now
    })).toEqual({
        trend: 'growing', registering: true, latestTerm: 'fall-2026', latestCount: 24,
        priorTerm: 'fall-2025', priorCount: 16, delta: 8
    });
});

test('the same DESN 326 style growth is growing once the term has started', () => {
    expect(model.computeTrend({
        history: { 'fall-2025': 16 },
        current: snapshot('fall-2026', 24),
        calendar,
        now: new Date('2026-09-24T12:00:00-07:00')
    })).toMatchObject({ trend: 'growing', registering: false, delta: 8 });
});

test('a registering course down three seats is declining', () => {
    expect(model.computeTrend({
        history: { 'fall-2025': 20 }, current: snapshot('fall-2026', 17), calendar, now
    })).toMatchObject({ trend: 'declining', registering: true, delta: -3 });
});

test('a two-seat year-over-year increase is stable', () => {
    expect(model.computeTrend({
        history: { 'spring-2025': 20, 'spring-2026': 22 }, calendar, now
    })).toMatchObject({ trend: 'stable', delta: 2 });
});

test('a latest count without the same quarter one year earlier is new', () => {
    expect(model.computeTrend({
        history: { 'winter-2025': 12, 'spring-2026': 14 }, calendar, now
    })).toEqual({
        trend: 'new', registering: false, latestTerm: 'spring-2026', latestCount: 14,
        priorTerm: null, priorCount: null, delta: null
    });
});

test('a snapshot replaces history for the same latest term', () => {
    expect(model.computeTrend({
        history: { 'fall-2025': 16, 'fall-2026': 10 },
        current: snapshot('fall-2026', 24),
        calendar,
        now: new Date('2026-09-24T12:00:00-07:00')
    })).toMatchObject({ trend: 'growing', latestCount: 24, priorCount: 16, delta: 8 });
});

test('a course with no counts has no computed trend', () => {
    expect(model.computeTrend({ history: {}, current: null, calendar, now })).toEqual({
        trend: null, registering: false, latestTerm: null, latestCount: null,
        priorTerm: null, priorCount: null, delta: null
    });
});

test('the view model computes the shipped DESN 326 snapshot trend', () => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../enrollment-dashboard-data.json'), 'utf8'));
    const snapshots = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/enrollment-registration-snapshots.json'), 'utf8'));
    const view = model.build(data, null, {
        year: '2026-27', quarter: 'fall', snapshots, calendar, now
    });
    expect(view.courses.find(course => course.code === 'DESN 326')).toMatchObject({
        trend: 'growing',
        registering: true,
        trendComparison: {
            registering: true,
            latestTerm: 'fall-2026', latestCount: 24,
            priorTerm: 'fall-2025', priorCount: 16, delta: 8
        }
    });
});

test('the view model keeps shipped DESN 100 declining while registration is open', () => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../enrollment-dashboard-data.json'), 'utf8'));
    const snapshots = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/enrollment-registration-snapshots.json'), 'utf8'));
    const view = model.build(data, null, {
        year: '2026-27', quarter: 'fall', snapshots, calendar, now
    });
    expect(view.courses.find(course => course.code === 'DESN 100')).toMatchObject({
        trend: 'declining',
        registering: true,
        trendComparison: {
            registering: true,
            latestTerm: 'fall-2026', latestCount: 23,
            priorTerm: 'fall-2025', priorCount: 45, delta: -22
        }
    });
    expect(view.trendCounts).toMatchObject({
        growing: 3, stable: 5, declining: 8, new: 3, registering: 19
    });
});
