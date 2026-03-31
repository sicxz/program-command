const ReleaseTimeManager = require('../js/release-time-manager.js');

describe('ReleaseTimeManager profile-aware behavior', () => {
    beforeEach(() => {
        localStorage.clear();
        ReleaseTimeManager.clearAll();
        delete global.WorkloadIntegration;
    });

    afterEach(() => {
        localStorage.clear();
        ReleaseTimeManager.clearAll();
        delete global.WorkloadIntegration;
        delete global.CONSTANTS;
    });

    test('uses storage namespaces so departments do not share release-time data', () => {
        ReleaseTimeManager.init({ storageNamespace: 'itdsSchedulerData_' });
        ReleaseTimeManager.addAllocation('Jordan Perez', '2026-27', {
            category: 'chair',
            credits: 5,
            quarters: ['Fall']
        });

        ReleaseTimeManager.init({ storageNamespace: 'designSchedulerData_' });
        expect(ReleaseTimeManager.getAllFacultyWithReleaseTime('2026-27')).toEqual([]);

        ReleaseTimeManager.init({ storageNamespace: 'itdsSchedulerData_' });
        expect(ReleaseTimeManager.getAllFacultyWithReleaseTime('2026-27')).toHaveLength(1);
    });

    test('labels applied-learning categories from the active profile course map', () => {
        global.WorkloadIntegration = {
            getAppliedLearningCourses: jest.fn(() => ([
                { code: 'ITDS 495', title: 'Internship', rate: 0.1 },
                { code: 'ITDS 499', title: 'Independent Study', rate: 0.2 }
            ]))
        };

        const labels = ReleaseTimeManager.getCategories().reduce((acc, category) => {
            acc[category.id] = category.label;
            return acc;
        }, {});

        expect(labels.independent_study).toBe('ITDS 499 / Independent Study');
        expect(labels.applied_learning).toBe('ITDS 495 / Internship');
    });
});
