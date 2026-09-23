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
        priorTerm: 'fall-2025', priorCount: 16, delta: 8,
        latestSeats: null, priorSeats: null, fillDelta: null, basis: 'seats'
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
        priorTerm: null, priorCount: null, delta: null,
        latestSeats: null, priorSeats: null, fillDelta: null, basis: 'seats'
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
        priorTerm: null, priorCount: null, delta: null,
        latestSeats: null, priorSeats: null, fillDelta: null, basis: null
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

test('without the seats file, shipped DESN 100 compares students and stays declining while registering', () => {
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
            priorTerm: 'fall-2025', priorCount: 45, delta: -22, basis: 'seats'
        }
    });
    expect(view.trendCounts).toMatchObject({
        growing: 3, stable: 5, declining: 8, new: 3, registering: 19
    });
});

function capture(quarter, ...pairs) {
    return {
        quarter,
        academicYear: quarter === 'fall-2026' ? '2026-27' : '2025-26',
        status: 'provisional',
        sections: pairs.map(([enrolled, capacity]) => ({ enrolled, capacity }))
    };
}

test('full at 24 last year and full at 20 now is stable on fill rate', () => {
    expect(model.computeTrend({
        history: { 'fall-2025': 24 }, seats: { 'fall-2025': 24 },
        current: capture('fall-2026', [20, 20]), calendar, now
    })).toMatchObject({
        trend: 'stable', basis: 'fill', fillDelta: 0, delta: -4,
        latestCount: 20, latestSeats: 20, priorCount: 24, priorSeats: 24
    });
});

test('22 of 24 falling to 14 of 20 is declining by 22 points', () => {
    expect(model.computeTrend({
        history: { 'fall-2025': 22 }, seats: { 'fall-2025': 24 },
        current: capture('fall-2026', [14, 20]), calendar, now
    })).toMatchObject({ trend: 'declining', basis: 'fill', fillDelta: -22 });
});

test('34 of 48 rising to 24 of 24 is growing by 29 points though ten fewer students', () => {
    expect(model.computeTrend({
        history: { 'fall-2025': 34 }, seats: { 'fall-2025': { seats: 48, sections: 2 } },
        current: capture('fall-2026', [24, 24]), calendar, now
    })).toMatchObject({ trend: 'growing', basis: 'fill', fillDelta: 29, delta: -10 });
});

test('without seats on either side the label keeps the three-student rule', () => {
    expect(model.computeTrend({
        history: { 'fall-2025': 20 }, seats: { 'fall-2025': 24 },
        current: snapshot('fall-2026', 17), calendar, now
    })).toMatchObject({ trend: 'declining', basis: 'seats', fillDelta: null, delta: -3, priorSeats: 24, latestSeats: null });
    expect(model.computeTrend({
        history: { 'spring-2025': 20, 'spring-2026': 22 }, calendar, now
    })).toMatchObject({ trend: 'stable', basis: 'seats', fillDelta: null, delta: 2 });
});

test('replaying the shipped files on 2026-09-22 gives the fill-rate labels', () => {
    const read = file => JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
    const view = model.build(read('enrollment-dashboard-data.json'), null, {
        year: '2026-27', quarter: 'fall', calendar,
        snapshots: read('data/enrollment-registration-snapshots.json'),
        seats: read('data/course-seats-by-quarter.json'),
        now: new Date('2026-09-22T12:00:00-07:00')
    });
    const trendOf = code => view.courses.find(course => course.code === code).trend;
    expect(Object.fromEntries(['DESN 263', 'DESN 374', 'DESN 490', 'DESN 359', 'DESN 100', 'DESN 200',
        'DESN 301', 'DESN 326', 'DESN 463'].map(code => [code, trendOf(code)]))).toEqual({
        'DESN 263': 'declining', 'DESN 374': 'declining', 'DESN 490': 'stable', 'DESN 359': 'stable',
        'DESN 100': 'stable', 'DESN 200': 'growing', 'DESN 301': 'growing', 'DESN 326': 'growing',
        'DESN 463': 'growing'
    });
    expect(view.courses.find(course => course.code === 'DESN 100').trendComparison).toMatchObject({
        basis: 'fill', priorCount: 45, priorSeats: 48, latestCount: 23, latestSeats: 23, fillDelta: 6
    });
});
