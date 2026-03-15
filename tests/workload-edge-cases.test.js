/**
 * [Tree/C-17] Workload regression tests for edge-case scenarios.
 * Covers overload, release-time, and unassigned cases with fixed expected totals.
 */

const WorkloadIntegration = require('../js/workload-integration.js');

describe('WorkloadIntegration edge cases', () => {
    beforeEach(() => {
        localStorage.clear();
        global.getYearData = () => ({ all: {}, fullTime: {}, adjunct: {}, former: {} });
    });

    afterEach(() => {
        delete global.getYearData;
        localStorage.clear();
    });

    test('overload: faculty over target gets status overloaded and utilization > 100', () => {
        localStorage.setItem('programCommandAySetup', JSON.stringify({
            '2025-26': {
                adjunctTargets: { fall: 0, winter: 0, spring: 0 },
                faculty: [
                    {
                        name: 'Overload Faculty',
                        role: 'Tenure/Tenure-track',
                        annualTargetCredits: 36,
                        releaseCredits: 0
                    }
                ]
            }
        }));

        // Schedule: 4×5 = 20 credits. Detail: 80 student credits × 0.2 = 16. Total = 36 (at target). Add one more course to exceed.
        localStorage.setItem('designSchedulerData_2025-26', JSON.stringify({
            fall: {
                MW: {
                    '10:00-12:20': [
                        { code: 'DESN 368', name: 'Course A', instructor: 'Overload Faculty', credits: 5, room: '206' },
                        { code: 'DESN 378', name: 'Course B', instructor: 'Overload Faculty', credits: 5, room: '209' }
                    ]
                }
            },
            winter: {
                MW: { '10:00-12:20': [
                    { code: 'DESN 400', name: 'Course C', instructor: 'Overload Faculty', credits: 5, room: '206' },
                    { code: 'DESN 401', name: 'Course D', instructor: 'Overload Faculty', credits: 5, room: '209' }
                ] }
            },
            spring: {
                MW: { '10:00-12:20': [{ code: 'DESN 499', name: 'IS', instructor: 'Overload Faculty', credits: 5, room: '206' }] }
            }
        }));

        WorkloadIntegration.saveFacultyWorkloadDetailEntries(
            '2025-26',
            'Overload Faculty',
            [
                { id: 'e1', quarter: 'Fall', courseCode: 'DESN 499', studentCredits: 100, workloadRate: 0.2, notes: 'IS' }
            ],
            'Overload Faculty'
        );

        const integrated = WorkloadIntegration.buildIntegratedWorkloadYearData({}, '2025-26');
        const faculty = integrated.all['Overload Faculty'];

        expect(faculty).toBeDefined();
        expect(faculty.status).toBe('overloaded');
        expect(faculty.utilizationRate).toBeGreaterThan(100);
        expect(faculty.totalWorkloadCredits).toBeGreaterThan(faculty.maxWorkload);
        expect(faculty.ayTargetCredits).toBe(36);
        expect(faculty.maxWorkload).toBe(36);
    });

    test('release-time: net target is target minus release credits', () => {
        localStorage.setItem('programCommandAySetup', JSON.stringify({
            '2025-26': {
                adjunctTargets: { fall: 0, winter: 0, spring: 0 },
                faculty: [
                    {
                        name: 'Chair Faculty',
                        role: 'Full Professor',
                        annualTargetCredits: 36,
                        releaseCredits: 18,
                        releaseReason: 'Chair'
                    }
                ]
            }
        }));

        localStorage.setItem('designSchedulerData_2025-26', JSON.stringify({
            fall: { MW: { '10:00-12:20': [{ code: 'DESN 368', name: 'Course', instructor: 'Chair Faculty', credits: 5, room: '206' }] } },
            winter: {},
            spring: {}
        }));

        const integrated = WorkloadIntegration.buildIntegratedWorkloadYearData({}, '2025-26');
        const faculty = integrated.all['Chair Faculty'];

        expect(faculty).toBeDefined();
        expect(faculty.ayTargetCredits).toBe(36);
        expect(faculty.ayReleaseCredits).toBe(18);
        expect(faculty.ayNetTargetCredits).toBe(18);
        expect(faculty.maxWorkload).toBe(18);
        expect(faculty.totalWorkloadCredits).toBe(5);
        expect(faculty.utilizationRate).toBeCloseTo((5 / 18) * 100, 1);
    });

    test('unassigned: TBD/instructor courses appear in meta unresolved and do not count toward assigned', () => {
        localStorage.setItem('programCommandAySetup', JSON.stringify({
            '2025-26': {
                adjunctTargets: { fall: 0, winter: 0, spring: 0 },
                faculty: [
                    { name: 'Assigned Faculty', role: 'Lecturer', annualTargetCredits: 45, releaseCredits: 0 }
                ]
            }
        }));

        localStorage.setItem('designSchedulerData_2025-26', JSON.stringify({
            fall: {
                MW: {
                    '10:00-12:20': [
                        { code: 'DESN 368', name: 'Course A', instructor: 'Assigned Faculty', credits: 5, room: '206' },
                        { code: 'DESN 378', name: 'Course B', instructor: 'TBD', credits: 5, room: '209' }
                    ]
                }
            },
            winter: {},
            spring: {}
        }));

        const integrated = WorkloadIntegration.buildIntegratedWorkloadYearData({}, '2025-26');

        expect(integrated.meta).toBeDefined();
        expect(integrated.meta.unresolvedScheduleCourses).toBeDefined();
        expect(integrated.meta.unresolvedScheduleCourses.count).toBeGreaterThanOrEqual(1);
        expect(integrated.meta.scheduleCourses).toBe(2);
        expect(integrated.meta.assignedScheduleCourses).toBe(1);

        const assigned = integrated.all['Assigned Faculty'];
        expect(assigned).toBeDefined();
        expect(assigned.totalWorkloadCredits).toBe(5);
        expect(assigned.courses).toHaveLength(1);
    });
});
