const ScheduleGenerator = require('../js/schedule-generator.js');
const DemandPredictor = require('../js/demand-predictor.js');

describe('schedule modules direct data init', () => {
    afterEach(() => {
        delete global.fetch;
        delete global.PrerequisiteGraph;
    });

    test('ScheduleGenerator can initialize from direct data without fetching the catalog', async () => {
        global.fetch = jest.fn(async (url) => {
            if (String(url).includes('workload-data')) {
                return {
                    ok: true,
                    json: async () => ({
                        workloadByYear: {
                            byYear: {}
                        }
                    })
                };
            }

            if (String(url).includes('enrollment-dashboard-data')) {
                return {
                    ok: true,
                    json: async () => ({
                        courseStats: {
                            'ITDS 201': {
                                average: 19,
                                quarterly: {
                                    'fall-2025': 19
                                }
                            }
                        }
                    })
                };
            }

            throw new Error(`Unexpected fetch: ${url}`);
        });

        await ScheduleGenerator.init({
            workloadData: {
                workloadByYear: {
                    byYear: {}
                }
            },
            catalogData: {
                courses: [
                    {
                        code: 'ITDS 201',
                        title: 'Interaction Design',
                        defaultCredits: 4,
                        typicalEnrollmentCap: 18,
                        offeredQuarters: ['Fall']
                    }
                ]
            },
            enrollmentData: {
                courseStats: {
                    'ITDS 201': {
                        average: 19,
                        quarterly: {
                            'fall-2025': 19
                        }
                    }
                }
            }
        });

        const result = await ScheduleGenerator.generateSchedule('fall', '2026-27');
        expect(result.recommendations).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    courseCode: 'ITDS 201',
                    credits: 4
                })
            ])
        );
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('DemandPredictor can use direct catalog data to label predictions', async () => {
        global.fetch = jest.fn(async (url) => {
            if (String(url).includes('enrollment-dashboard-data')) {
                return {
                    ok: true,
                    json: async () => ({
                        courseStats: {
                            'ITDS 201': {
                                average: 20,
                                sections: 1,
                                quarterly: {
                                    'fall-2024': { total: 18 },
                                    'fall-2025': { total: 22 }
                                },
                                trend: 'growing'
                            }
                        }
                    })
                };
            }

            throw new Error(`Unexpected fetch: ${url}`);
        });

        global.PrerequisiteGraph = {
            init: jest.fn(async () => ({ success: true })),
            calculatePipeline: jest.fn(() => ({
                sources: [],
                bottlenecks: []
            })),
            getTracksForCourse: jest.fn(() => [])
        };

        await DemandPredictor.init({
            enrollmentData: {
                courseStats: {
                    'ITDS 201': {
                        average: 20,
                        sections: 1,
                        quarterly: {
                            'fall-2024': { total: 18 },
                            'fall-2025': { total: 22 }
                        },
                        trend: 'growing'
                    }
                }
            },
            catalogData: [
                {
                    code: 'ITDS 201',
                    title: 'Interaction Design',
                    typicalEnrollmentCap: 18
                }
            ]
        });

        const result = DemandPredictor.predictCourseDemand('ITDS 201', 'Fall', '2026-27');
        expect(result.courseName).toBe('Interaction Design');
        expect(global.fetch).not.toHaveBeenCalled();
    });
});
