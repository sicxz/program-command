const persistence = require('../js/schedule-persistence.js');

describe('SchedulePersistence', () => {
    test('builds a scheduler snapshot from database rows', () => {
        const snapshot = persistence.buildScheduleSnapshotFromDatabaseRows([
            {
                quarter: 'spring',
                day_pattern: 'MTWRF',
                time_slot: '08:00-08:50',
                section: '040',
                projected_enrollment: 24,
                course: {
                    code: 'elec 452',
                    title: 'Protective Relays',
                    default_credits: 4
                },
                faculty: {
                    name: 'Sylvia, Adam'
                },
                room: {
                    room_code: 'Catalyst 202'
                }
            }
        ]);

        expect(snapshot.spring.MTWRF['08:00-08:50']).toEqual([
            expect.objectContaining({
                code: 'ELEC 452',
                name: 'Protective Relays',
                instructor: 'Sylvia, Adam',
                credits: 4,
                room: 'CATALYST 202',
                section: '040',
                enrollmentCap: 24
            })
        ]);
    });

    test('counts all scheduled rows across quarters', () => {
        const schedule = persistence.createEmptyAcademicYearScheduleData();
        schedule.fall.MW = {
            '09:00-10:50': [{ code: 'CSCD 110' }]
        };
        schedule.spring.ONLINE.async.push({ code: 'CYBR 210' });

        expect(persistence.countScheduleCourses(schedule)).toBe(2);
    });
});
