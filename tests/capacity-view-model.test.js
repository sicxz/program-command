const CapacityViewModel = require('../js/capacity-view-model.js');
const WorkloadIntegration = require('../js/workload-integration.js');

const course = (code, quarter, credits = 5, extra = {}) => ({
    courseCode: code, quarter, credits, workloadCredits: credits, section: '001', ...extra
});
const faculty = (courses, extra = {}) => ({
    category: 'fullTime', ayTargetCredits: 36, ayReleaseCredits: 0, ayNetTargetCredits: 36,
    courses, ...extra
});
const build = (all, options = {}, meta = {}) => CapacityViewModel.build({ all, meta }, {
    year: '2026-27', quarter: 'annual', ...options
});

describe('CapacityViewModel', () => {
    test('builds weighted faculty load directly from regular and applied-learning course records', () => {
        const appliedConfig = WorkloadIntegration.getAppliedLearningCourseConfig();
        const source = CapacityViewModel.loadFromCourseRecords([
            { assignedFaculty: 'Taylor', courseCode: 'DESN 100', credits: 5, quarter: 'Fall' },
            { instructor: 'Taylor', courseCode: 'DESN 200', credits: 5, quarter: 'Winter' },
            { assignedFaculty: 'Taylor', courseCode: 'DESN 495', credits: 5, quarter: 'Spring' }
        ], appliedConfig);
        const record = source.all.Taylor;
        expect(record.totalCredits).toBe(15);
        expect(record.totalWorkloadCredits).toBe(10 + (5 * appliedConfig['DESN 495'].rate));
        expect(record.appliedLearningLoad.sections).toBe(1);
        expect(record.appliedLearningLoad.workloadCredits).toBe(5 * appliedConfig['DESN 495'].rate);
        expect(record).toMatchObject({ facultyName: 'Taylor', category: 'fullTime', source: 'course-records' });
    });

    test('keeps an unassigned course record out of every faculty record', () => {
        const source = CapacityViewModel.loadFromCourseRecords([
            { assignedFaculty: 'TBD', courseCode: 'DESN 100', credits: 5, quarter: 'Fall' }
        ], WorkloadIntegration.getAppliedLearningCourseConfig());
        expect(Object.keys(source.all)).toEqual([]);
        expect(source.meta.unresolvedScheduleCourses).toMatchObject({ count: 1, totalWorkloadCredits: 5 });
        const result = CapacityViewModel.build(source);
        expect(result.rows).toEqual([]);
        expect(result.unassigned).toHaveLength(1);
        expect(result.totals.unassignedWorkload).toBe(5);
    });

    test('empty workload remains unknown rather than unused annual capacity', () => {
        const result = build({ Taylor: faculty([], { totalWorkloadCredits: 0, sections: 0 }) });
        expect(result.hasWorkload).toBe(false);
        expect(result.sourceKind).toBe('missing');
        expect(result.rows[0]).toMatchObject({ workload: null, annualWorkload: null, overTarget: null });
        expect(result.totals).toMatchObject({ netTarget: 36, totalWorkload: null, sections: null, overTarget: null });
        expect(result.quarters.every(quarter => quarter.workload === null && !quarter.recorded)).toBe(true);
    });

    test('full release preserves a zero net target despite the integration maxWorkload fallback', () => {
        const result = build({ Chair: faculty([course('DESN 100', 'Fall')], {
            ayReleaseCredits: 36, ayNetTargetCredits: 0, maxWorkload: 36
        }) });
        expect(result.rows[0]).toMatchObject({ grossTarget: 36, release: 36, netTarget: 0, workload: 5, overTarget: 5 });
        expect(result.totals).toMatchObject({ grossTarget: 36, release: 36, netTarget: 0, overTarget: 5 });
    });

    test('counts inactive, adjunct, former and unassigned teaching without adding their targets', () => {
        const result = build({
            Active: faculty([course('DESN 100', 'Fall')]),
            Inactive: faculty([course('DESN 200', 'Fall')], { ayActive: false }),
            Adjunct: faculty([course('DESN 216', 'Fall')], { category: 'adjunct', ayNetTargetCredits: 15 }),
            Former: faculty([course('DESN 300', 'Fall')], { category: 'former' })
        }, {}, {
            hasLiveSchedule: true,
            unresolvedScheduleCourses: {
                count: 1, totalWorkloadCredits: 5,
                courses: [course('DESN 400', 'Winter', 5, { instructor: 'TBD' })]
            }
        });
        expect(result.totals).toMatchObject({
            netTarget: 36, fullTimeCount: 1, fullTimeWorkload: 5, adjunctWorkload: 5,
            otherWorkload: 10, unassignedWorkload: 5, totalWorkload: 25, sections: 5
        });
        expect(result.unassigned).toHaveLength(1);
        expect(result.rows.find(row => row.name === 'Inactive').overTarget).toBeNull();
        expect(result.rows.find(row => row.name === 'Former').active).toBe(false);
    });

    test('annual overage adds individual excess without offsetting it against someone else’s target', () => {
        const result = build({
            Overloaded: faculty([course('DESN 100', 'Fall', 40)]),
            UnderTarget: faculty([course('DESN 200', 'Fall', 5)])
        });
        expect(result.totals.totalWorkload).toBe(45);
        expect(result.totals.netTarget).toBe(72);
        expect(result.totals.overTarget).toBe(4);
    });

    test('a partial draft exposes recorded quarters and never invents quarter targets or utilization', () => {
        const result = build({ Taylor: faculty([course('DESN 100', 'Fall')]) }, { quarter: 'Fall' }, { hasLiveSchedule: true });
        expect(result.sourceKind).toBe('draft');
        expect(result.partialYear).toBe(true);
        expect(result.recordedQuarters).toEqual(['Fall']);
        expect(result.quarters).toEqual([
            { name: 'Fall', recorded: true, workload: 5, sections: 1 },
            { name: 'Winter', recorded: false, workload: null, sections: null },
            { name: 'Spring', recorded: false, workload: null, sections: null },
            { name: 'Summer', recorded: false, workload: null, sections: null }
        ]);
        expect(result.rows[0].overTarget).toBeNull();
        expect(result.totals.overTarget).toBeNull();
        expect(result.totals).not.toHaveProperty('utilization');
        expect(result.totals).not.toHaveProperty('availableCapacity');
    });

    test('an unrecorded selected quarter remains unknown in every workload total', () => {
        const result = build({ Taylor: faculty([course('DESN 100', 'Fall')]) }, { quarter: 'Spring' });
        expect(result.hasWorkload).toBe(true);
        expect(result.scopeHasWorkload).toBe(false);
        expect(result.rows[0].workload).toBeNull();
        expect(result.totals).toMatchObject({
            fullTimeWorkload: null, adjunctWorkload: null, otherWorkload: null,
            unassignedWorkload: null, totalWorkload: null, sections: null
        });
    });

    test('filters the selected quarter and preserves weighted applied-learning workload', () => {
        const all = { Taylor: faculty([
            course('DESN 100', 'Fall'),
            course('DESN 499', 'Fall', 20, { multiplier: 0.2, workloadCredits: 4, type: 'applied-learning' }),
            course('DESN 200', 'Winter')
        ]) };
        const included = build(all, { quarter: 'Fall' });
        expect(included.totals.totalWorkload).toBe(9);
        expect(included.rows[0].annualWorkload).toBe(14);
        const excluded = build(all, { quarter: 'Fall', includeAppliedLearning: false });
        expect(excluded.totals.totalWorkload).toBe(5);
        expect(excluded.totals.sections).toBe(1);
        expect(excluded.rows[0].annualWorkload).toBe(10);
    });

    test('a recorded quarter with only excluded applied learning is a known zero', () => {
        const result = build({ Taylor: faculty([
            course('DESN 495', 'Spring', 10, { workloadCredits: 1, multiplier: 0.1 })
        ]) }, { quarter: 'Spring', includeAppliedLearning: false });
        expect(result.hasWorkload).toBe(true);
        expect(result.scopeHasWorkload).toBe(true);
        expect(result.rows[0]).toMatchObject({ workload: 0, sections: 0, annualWorkload: 0 });
        expect(result.totals.totalWorkload).toBe(0);
        expect(result.quarters[2]).toEqual({ name: 'Spring', recorded: true, workload: 0, sections: 0 });
    });

    test('filters weighted unassigned courses without adding the unresolved summary twice', () => {
        const meta = {
            hasLiveSchedule: true,
            unresolvedScheduleCourses: {
                totalWorkloadCredits: 6, count: 2,
                courses: [course('DESN 100', 'Fall'), course('DESN 499', 'Winter', 5, { workloadCredits: 1 })]
            }
        };
        expect(build({}, {}, meta).totals.totalWorkload).toBe(6);
        const result = build({}, { quarter: 'Winter', includeAppliedLearning: false }, meta);
        expect(result.totals.unassignedWorkload).toBe(0);
        expect(result.totals.totalWorkload).toBe(0);
        expect(result.unassigned).toEqual([]);
    });

    test('missing targets stay null and suppress annual comparisons', () => {
        const result = build({ Taylor: { category: 'fullTime', courses: [course('DESN 100', 'Fall')] } });
        expect(result.targetKnown).toBe(false);
        expect(result.rows[0]).toMatchObject({ grossTarget: null, release: null, netTarget: null, overTarget: null });
        expect(result.totals.netTarget).toBeNull();
        expect(result.totals.totalWorkload).toBe(5);
    });

    test('a missing faculty workload does not become a confirmed zero individual overage', () => {
        const result = build({
            Recorded: faculty([course('DESN 100', 'Fall', 40)]),
            Missing: faculty([])
        });
        expect(result.rows[0].overTarget).toBe(4);
        expect(result.rows[1].overTarget).toBeNull();
        expect(result.totals.overTarget).toBeNull();
    });

    test('supports static faculty dictionaries and summary-only positive evidence', () => {
        const result = CapacityViewModel.build({
            fullTime: {
                Taylor: { maxWorkload: 36, totalWorkloadCredits: 15, scheduledCredits: 10, sections: 3,
                    byQuarter: { Fall: { workload: 15, scheduledCredits: 10, sections: 3 } } }
            }
        });
        expect(result.sourceKind).toBe('historical');
        expect(result.rows[0]).toMatchObject({ name: 'Taylor', category: 'fullTime', workload: 15, sections: 3,
            grossTarget: null, recordedTarget: 36, release: null, netTarget: null, targetInferred: true });
        expect(result.quarters[0].workload).toBe(15);
        const excluded = CapacityViewModel.build({ all: {
            Taylor: { category: 'fullTime', totalWorkloadCredits: 15, scheduledCredits: 0, sections: 3 }
        } }, { includeAppliedLearning: false });
        expect(excluded.totals.totalWorkload).toBe(0);
        expect(excluded.totals.sections).toBeNull();
    });

    test('ignores zero summary buckets created by the integration for missing quarters', () => {
        const result = build({ Taylor: faculty([], {
            totalWorkloadCredits: 0,
            byQuarter: { Fall: { workload: 0, sections: 0 }, Winter: { workload: 0, sections: 0 } }
        }) });
        expect(result.hasWorkload).toBe(false);
        expect(result.recordedQuarters).toEqual([]);
    });

    test('invalid and absent course workloads do not silently become zero', () => {
        const result = build({ Taylor: faculty([{ courseCode: 'DESN 100', quarter: 'Fall', workloadCredits: null }]) });
        expect(result.hasWorkload).toBe(true);
        expect(result.totals.totalWorkload).toBeNull();
        expect(result.totals.fullTimeWorkload).toBeNull();
        expect(result.rows[0].workload).toBeNull();
        expect(result.totals.sections).toBe(1);
    });

    test('applied-learning detail entries have distinct provenance and inferred targets stay labeled', () => {
        const result = build({ Taylor: faculty([course('DESN 499', 'Fall', 10, { workloadCredits: 2 })]) }, {}, {
            source: 'integrated', detailFaculty: 1,
            fallbackTargetRulesApplied: [{ matchedFaculty: ['Taylor'] }]
        });
        expect(result.sourceKind).toBe('details');
        expect(result.rows[0]).toMatchObject({ targetInferred: true, targetSource: 'default' });
    });

    test('inactive adjunct workload is reconciled under other assigned teaching', () => {
        const result = build({
            Taylor: faculty([course('DESN 100', 'Fall')]),
            Morgan: faculty([course('DESN 200', 'Fall')], { category: 'adjunct', ayActive: false })
        });
        expect(result.totals).toMatchObject({ fullTimeWorkload: 5, adjunctWorkload: 0, otherWorkload: 5, totalWorkload: 10 });
    });

    test('missing historical data does not repeat the integration’s scheduler-source assumption', () => {
        const result = build({}, {}, { source: 'integrated', preliminaryAssumptions: [
            'Teaching workload is derived from the Program Command scheduler draft for the selected academic year.',
            'Review releases.'
        ] });
        expect(result.sourceKind).toBe('missing');
        expect(result.assumptions).toEqual(['Review releases.']);
    });

    test('historical targets preserve a recorded limit without claiming gross, releases, net or workload', () => {
        const result = build({}, { recordedTargets: [{ name: 'Taylor', capacity: 36 }, { name: 'Morgan', capacity: 45 }] });
        expect(result.rows).toHaveLength(2);
        expect(result.rows[0]).toMatchObject({ recordedTarget: 36, grossTarget: null, release: null, netTarget: null,
            workload: null, targetSource: 'recorded', targetInferred: true });
        expect(result.totals).toMatchObject({ recordedTarget: 81, grossTarget: null, release: null, netTarget: null, totalWorkload: null });
        expect(result.sourceKind).toBe('missing');
        expect(result.targetKnown).toBe(false);
    });

    test.each([{ hasLiveSchedule: true }, { ayFaculty: 1 }])('does not insert historical targets into a current roster: %j', meta => {
        const result = build({ Taylor: faculty([]) }, { recordedTargets: [{ name: 'Old Faculty', capacity: 45 }] }, meta);
        expect(result.rows.map(row => row.name)).toEqual(['Taylor']);
        expect(result.totals.netTarget).toBe(36);
    });

    test('historical target fallback neither duplicates existing faculty nor replaces their real targets', () => {
        const result = build({ Taylor: faculty([]) }, {
            recordedTargets: [{ name: 'Taylor', capacity: 100 }, { name: 'New Faculty', capacity: 45 }]
        });
        expect(result.rows).toHaveLength(2);
        expect(result.rows[0].grossTarget).toBe(36);
        expect(result.totals.netTarget).toBeNull();
        expect(result.totals.recordedTarget).toBeNull();
    });

    test('does not mutate source records, metadata, options, or their nested arrays', () => {
        const source = { all: { Taylor: faculty([course('DESN 100', 'Fall')]) }, meta: {
            preliminaryAssumptions: ['Draft'], unresolvedScheduleCourses: { courses: [course('DESN 200', 'Winter')] }
        } };
        const options = { quarter: 'Fall', recordedTargets: [{ name: 'Morgan', capacity: 45 }] };
        const before = JSON.stringify({ source, options });
        const result = CapacityViewModel.build(source, options);
        result.meta.preliminaryAssumptions.push('Changed');
        result.rows[0].name = 'Changed';
        expect(JSON.stringify({ source, options })).toBe(before);
    });

    test('exactYearSource prevents aggregate fallback without discarding genuine requested-year data', () => {
        const original = { facultyWorkload: { Old: faculty([course('DESN 100', 'Fall', 100)]) },
            workloadByYear: { byYear: { '2025-26': { all: { Recent: faculty([course('DESN 200', 'Winter')]) } } } } };
        const before = JSON.stringify(original);
        const exact = CapacityViewModel.exactYearSource(original, '2026-27');
        expect(exact.workloadByYear.byYear['2026-27']).toEqual({ all: {}, fullTime: {}, adjunct: {}, former: {} });
        expect(exact.workloadByYear.byYear['2025-26']).toEqual(original.workloadByYear.byYear['2025-26']);
        expect(JSON.stringify(original)).toBe(before);
        localStorage.clear();
        global.getYearData = (data, year) => data.workloadByYear?.byYear?.[year] || { all: data.facultyWorkload };
        try {
            const integrated = WorkloadIntegration.buildIntegratedWorkloadYearData(exact, '2026-27');
            expect(CapacityViewModel.build(integrated).hasWorkload).toBe(false);
            expect(integrated.all).toEqual({});
        } finally {
            delete global.getYearData;
            localStorage.clear();
        }
    });
});

test('profile-derived scheduled classifications take precedence over legacy applied-learning codes', () => {
    const result = CapacityViewModel.build({ all: { Faculty: { category: 'fullTime', courses: [
        { courseCode: 'DESN 399', quarter: 'Fall', type: 'scheduled', credits: 5, multiplier: 1, workloadCredits: 5 }
    ] } } }, { includeAppliedLearning: false, quarter: 'Fall' });
    expect(result.totals.totalWorkload).toBe(5);
});
