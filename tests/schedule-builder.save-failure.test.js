describe('schedule-builder save failure rollback safety', () => {
    let builder;
    let originalAddEventListener;
    let consoleErrorSpy;

    beforeEach(() => {
        jest.resetModules();

        document.body.innerHTML = `
            <div id="toast" class="toast"></div>
            <span id="toastMessage"></span>
            <select id="academicYear">
                <option value="2026-27" selected>2026-27</option>
            </select>
        `;

        originalAddEventListener = document.addEventListener;
        document.addEventListener = jest.fn((eventName, handler, options) => {
            if (eventName === 'DOMContentLoaded') {
                return;
            }
            return originalAddEventListener.call(document, eventName, handler, options);
        });

        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        global.isSupabaseConfigured = jest.fn(() => true);
        global.dbService = {
            initialize: jest.fn().mockResolvedValue('dept-1'),
            getOrCreateYear: jest.fn().mockResolvedValue({ id: 'year-1' }),
            lookupCourseId: jest.fn().mockResolvedValue('course-1'),
            lookupFacultyId: jest.fn().mockResolvedValue('faculty-1'),
            lookupRoomId: jest.fn().mockResolvedValue('room-1'),
            syncScheduledCoursesForAcademicYear: jest.fn().mockRejectedValue({
                code: '42501',
                message: 'permission denied by policy'
            })
        };

        builder = require('../pages/schedule-builder.js');
    });

    afterEach(() => {
        document.addEventListener = originalAddEventListener;
        consoleErrorSpy.mockRestore();
        delete global.dbService;
        delete global.isSupabaseConfigured;
    });

    test('does not mutate local draft state when atomic sync fails', async () => {
        builder.__setSaveStateForTests({
            currentSchedule: { year: '2026-27', quarter: 'Fall' },
            activeQuarter: 'Fall',
            assignedCourses: {
                'MW-10:00-12:20-206': [
                    {
                        courseCode: 'DESN 101',
                        facultyName: 'Travis Masingale',
                        section: '001',
                        predictedDemand: 18
                    }
                ]
            },
            caseByeCaseCourses: [],
            allQuartersSchedule: {
                Fall: { assignedCourses: {}, caseByeCaseCourses: [] },
                Winter: { assignedCourses: {}, caseByeCaseCourses: [] },
                Spring: { assignedCourses: {}, caseByeCaseCourses: [] }
            }
        });

        const beforeState = JSON.parse(JSON.stringify(builder.__getSaveStateForTests()));

        await builder.saveToDatabase();

        const afterState = JSON.parse(JSON.stringify(builder.__getSaveStateForTests()));

        expect(afterState).toEqual(beforeState);
        expect(global.dbService.getOrCreateYear).toHaveBeenCalledWith('2026-27', expect.objectContaining({
            schedulerProfileSnapshot: expect.objectContaining({
                dayPatterns: expect.arrayContaining([
                    expect.objectContaining({ id: 'MW' }),
                    expect.objectContaining({ id: 'TR' })
                ]),
                timeSlots: expect.arrayContaining([
                    expect.objectContaining({ id: '10:00-12:20' }),
                    expect.objectContaining({ id: '13:00-15:20' }),
                    expect.objectContaining({ id: '16:00-18:20' })
                ])
            })
        }));
        expect(global.dbService.syncScheduledCoursesForAcademicYear).toHaveBeenCalledTimes(1);
        expect(document.getElementById('toastMessage').textContent).toContain('Save blocked by permissions');
    });

    test('parses schedule slot keys with full time range', () => {
        expect(builder.parseScheduleSlotKey('MW-10:00-12:20-206')).toEqual({
            dayPattern: 'MW',
            timeSlot: '10:00-12:20',
            roomCode: '206'
        });
    });
});
