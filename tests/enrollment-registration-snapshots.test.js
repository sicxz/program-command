const model = require('../js/enrollment-view-model.js');
const source = require('../enrollment-dashboard-data.json');
const catalog = require('../data/course-catalog.json');
const snapshots = require('../data/enrollment-registration-snapshots.json');
const clone = value => JSON.parse(JSON.stringify(value));
const view = options => model.build(source, catalog, { year: 'all', snapshots, ...options });

test('captured registrations reconcile to complete, unique Design section searches', () => {
    const captures = model.readSnapshots(snapshots);
    expect(captures.map(term => [term.sections.length, term.total, term.capacity, term.waitlisted, term.missingWaitlists]))
        .toEqual([[39, 365, 485, 0, 19], [39, 338, 458, 0, 21], [23, 300, 362, 9, 5]]);
    expect(captures.map(term => term.academicYear)).toEqual(['2025-26', '2025-26', '2026-27']);
    expect(captures.map(term => new Set(term.sections.map(section => section.crn)).size)).toEqual([39, 39, 23]);
    expect(captures[2].sections.find(section => section.crn === '40438')).toMatchObject({ enrolled: 24, waitlisted: 2 });
});

test('Enrollment overlay preserves baseline history and completes 2025–26 without changing planning inputs', () => {
    const before = JSON.stringify(source);
    const result = view();
    expect(result.totalRegistrations).toBe(5041);
    expect(result.courseCount).toBe(42);
    expect(result.quarters).toHaveLength(13);
    expect(result.quarters.slice(-3).map(q => q.total)).toEqual([365, 338, 300]);
    expect(JSON.stringify(source)).toBe(before);
    expect(model.build(source, catalog, { year: 'all' }).totalRegistrations).toBe(4038);
    const completed = view({ year: '2025-26' });
    expect(completed.totalRegistrations).toBe(1071);
    expect(completed.coverage.complete).toBe(true);
    expect(completed.comparison).toMatchObject({ current: 1071, previous: 1272, delta: -201 });
    expect(result.courses.find(course => course.code === 'DESN 369').trend).toBe('unknown');
});

test('observed zero stays distinct from an absent course or missing waitlist', () => {
    const fall = view({ year: '2026-27', quarter: 'fall' });
    expect(fall.courses.find(course => course.code === 'DESN 491').periodTotal).toBe(0);
    expect(fall.courses.some(course => course.code === 'DESN 345')).toBe(false);
    expect(model.readSnapshots(snapshots)[2].sections.find(section => section.crn === '42277')).toMatchObject({ enrolled: 0, waitlisted: null });
});

test('provisional capture status survives calendar changes and suppresses period and course changes', () => {
    for (const now of ['2026-09-13', '2026-10-15', '2027-09-13']) {
        const result = view({ year: '2026-27', quarter: 'fall', now });
        expect(result.comparison).toBeNull();
        expect(result.provisionalQuarters).toEqual(['Fall 2026']);
        expect(result.history.provisional).toEqual([false, false, false, false, true]);
        expect(result.history.rows.every(course => course.delta === null && course.percent === null)).toBe(true);
    }
    const winter = view({ quarter: 'winter' });
    expect(winter.history.totals).toEqual([446, 395, 437, 365]);
});

test('a full term capture replaces existing term counts instead of accumulating snapshots', () => {
    const baseline = clone(source);
    baseline.courseStats['DESN 100'].quarterly['fall-2026'] = 999;
    baseline.courseStats['DESN 345'] = { quarterly: { 'fall-2026': 50 } };
    expect(model.build(baseline, catalog, { year: '2026-27', snapshots }).totalRegistrations).toBe(300);
});

test.each([
    ['numeric CRN alias', bundle => { bundle.terms[0].sections[1].crn = Number(bundle.terms[0].sections[0].crn); }],
    ['duplicate CRN', bundle => { bundle.terms[0].sections[1].crn = bundle.terms[0].sections[0].crn; }],
    ['missing result', bundle => { bundle.terms[0].sections.pop(); }],
    ['incomplete search', bundle => { bundle.terms[0].completeSearch = false; }],
    ['missing count', bundle => { bundle.terms[0].sections[0].available = null; }],
    ['invalid count', bundle => { bundle.terms[0].sections[0].capacity = '24'; }],
    ['negative enrollment', bundle => { bundle.terms[0].sections[0].available = 25; }],
    ['duplicate term', bundle => { bundle.terms.push(clone(bundle.terms[0])); }],
    ['incorrect year', bundle => { bundle.terms[0].academicYear = '2026-27'; }]
])('rejects %s rather than displaying partial or misleading totals', (label, mutate) => {
    const bundle = clone(snapshots);
    mutate(bundle);
    expect(() => model.readSnapshots(bundle)).toThrow();
});

test('negative available seats preserve over-enrollment instead of being clamped', () => {
    const bundle = clone(snapshots);
    bundle.terms[0].sections[0].available = -2;
    expect(model.readSnapshots(bundle)[0].sections[0].enrolled).toBe(26);
});
