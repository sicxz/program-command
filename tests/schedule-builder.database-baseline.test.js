describe('schedule-builder database baseline hydration', () => {
    let builder;
    let originalAddEventListener;

    beforeEach(() => {
        jest.resetModules();

        document.body.innerHTML = '';
        originalAddEventListener = document.addEventListener;
        document.addEventListener = jest.fn((eventName, handler, options) => {
            if (eventName === 'DOMContentLoaded') {
                return;
            }
            return originalAddEventListener.call(document, eventName, handler, options);
        });

        builder = require('../pages/schedule-builder.js');
    });

    afterEach(() => {
        document.addEventListener = originalAddEventListener;
    });

    test('builds quarter schedules from saved scheduled_courses rows', () => {
        const result = builder.buildQuarterSchedulesFromDatabaseRecords([
            {
                quarter: 'Fall',
                day_pattern: 'MW',
                time_slot: '10:00-12:20',
                section: '001',
                projected_enrollment: 18,
                course: {
                    code: 'DESN 101',
                    title: 'Design Lab',
                    default_credits: 5
                },
                faculty: {
                    name: 'Travis Masingale'
                },
                room: {
                    room_code: '206'
                }
            },
            {
                quarter: 'Winter',
                day_pattern: 'TR',
                time_slot: '13:00-15:20',
                section: '001',
                projected_enrollment: 12,
                course: {
                    code: 'DESN 201',
                    title: 'Typography',
                    default_credits: 5
                },
                faculty: {
                    name: 'Ginelle Hustrulid'
                },
                room: {
                    room_code: '209'
                }
            }
        ], '2026-27');

        expect(result.totalSections).toBe(2);
        expect(result.quarterSchedules.Fall.assignedCourses['MW-10:00-12:20-206']).toEqual([
            expect.objectContaining({
                courseCode: 'DESN 101',
                facultyName: 'Travis Masingale',
                predictedDemand: 18
            })
        ]);
        expect(result.quarterSchedules.Winter.assignedCourses['TR-13:00-15:20-209']).toEqual([
            expect.objectContaining({
                courseCode: 'DESN 201',
                facultyName: 'Ginelle Hustrulid',
                predictedDemand: 12
            })
        ]);
        expect(result.quarterSchedules.Fall.recommendations).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    courseCode: 'DESN 101'
                })
            ])
        );
    });
});
