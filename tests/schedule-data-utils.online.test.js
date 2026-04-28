const {
    buildScheduleDataFromDatabaseRecords,
    createEmptyAcademicYearScheduleData,
    ensureOnlineCourseBucketForQuarter,
    getOnlineCoursesForQuarter,
    flattenQuarterData,
    scheduleHasCourses
} = require('../js/schedule-data-utils.js');

describe('schedule data utils online bucket normalization', () => {
    test('normalizes legacy nested online aliases into ONLINE.async', () => {
        const asyncCourse = {
            code: 'DESN 216',
            title: 'Digital Foundations',
            instructor: 'Barton/Pettigrew'
        };

        const quarterData = {
            online: {
                asynchronous: [asyncCourse]
            },
            MW: {}
        };

        const onlineCourses = ensureOnlineCourseBucketForQuarter(quarterData);

        expect(onlineCourses).toHaveLength(1);
        expect(onlineCourses[0]).toBe(asyncCourse);
        expect(quarterData.ONLINE.async).toEqual([asyncCourse]);
        expect(quarterData.online).toBeUndefined();
        expect(asyncCourse.room).toBe('ONLINE');
    });

    test('merges current and legacy ONLINE aliases without dropping either list', () => {
        const asyncCourse = { code: 'DESN 216', name: 'Digital Foundations', instructor: 'A', room: 'ONLINE' };
        const legacyCourse = { code: 'DESN 316', name: 'UI Systems', instructor: 'B' };

        const quarterData = {
            ONLINE: {
                async: [asyncCourse],
                online: [legacyCourse]
            }
        };

        const onlineCourses = getOnlineCoursesForQuarter(quarterData);

        expect(onlineCourses).toEqual([asyncCourse, legacyCourse]);
        expect(quarterData.ONLINE.async).toEqual([asyncCourse, legacyCourse]);
        expect(quarterData.ONLINE.online).toBeUndefined();
        expect(legacyCourse.room).toBe('ONLINE');
    });

    test('flattenQuarterData includes legacy top-level async arrays under ONLINE/async', () => {
        const inPersonCourse = {
            code: 'DESN 100',
            name: 'Drawing Communication',
            instructor: 'Faculty A',
            room: '206'
        };
        const onlineCourse = {
            code: 'DESN 216',
            title: 'Digital Foundations',
            instructor: 'Faculty B'
        };

        const quarterData = {
            MW: {
                '10:00-12:20': [inPersonCourse]
            },
            async: [onlineCourse]
        };

        const flattened = flattenQuarterData(quarterData);
        const onlineResult = flattened.find((course) => course.day === 'ONLINE');
        const inPersonResult = flattened.find((course) => course.day === 'MW');

        expect(flattened).toHaveLength(2);
        expect(inPersonResult.time).toBe('10:00-12:20');
        expect(onlineResult).toMatchObject({
            code: 'DESN 216',
            day: 'ONLINE',
            time: 'async',
            room: 'ONLINE'
        });
        expect(quarterData.async).toBeUndefined();
        expect(quarterData.ONLINE.async).toHaveLength(1);
    });

    test('builds scheduler buckets from Supabase scheduled course rows', () => {
        const scheduleData = buildScheduleDataFromDatabaseRecords([
            {
                quarter: 'fall',
                day_pattern: 'MW',
                time_slot: '10:00-12:20',
                section: '001',
                projected_enrollment: 24,
                course: { code: 'desn 216', title: 'Digital Foundations', default_credits: 5 },
                faculty: { name: 'A. Faculty' },
                room: { room_code: '206' }
            },
            {
                quarter: 'fall',
                day_pattern: 'online',
                time_slot: 'async',
                section: '002',
                course: { code: 'DESN 316', title: 'UI Systems', default_credits: 5 },
                faculty: { name: 'B. Faculty' }
            },
            {
                quarter: 'winter',
                day_pattern: 'arranged',
                time_slot: 'arranged',
                section: '003',
                course: { code: 'DESN 490', title: 'Capstone', default_credits: 5 },
                faculty: { name: 'C. Faculty' }
            }
        ], {
            dayPatterns: ['MW', 'TR'],
            normalizeCourseCode: (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, ' '),
            normalizeInstructor: (value) => String(value || '').trim() || 'TBD'
        });

        expect(scheduleData.fall.MW['10:00-12:20']).toEqual([
            expect.objectContaining({
                code: 'DESN 216',
                room: '206',
                instructor: 'A. Faculty',
                enrollmentCap: 24
            })
        ]);
        expect(scheduleData.fall.ONLINE.async).toEqual([
            expect.objectContaining({
                code: 'DESN 316',
                room: 'ONLINE',
                instructor: 'B. Faculty'
            })
        ]);
        expect(scheduleData.winter.ARRANGED.arranged).toEqual([
            expect.objectContaining({
                code: 'DESN 490',
                room: 'ARRANGED',
                instructor: 'C. Faculty'
            })
        ]);
    });

    test('scheduleHasCourses distinguishes empty and populated schedule snapshots', () => {
        const emptySchedule = createEmptyAcademicYearScheduleData({ dayPatterns: ['MW', 'TR'] });
        const populatedSchedule = buildScheduleDataFromDatabaseRecords([
            {
                quarter: 'spring',
                day_pattern: 'ONLINE',
                time_slot: 'async',
                course: { code: 'DESN 379', title: 'Web Dev 2', default_credits: 5 }
            }
        ], {
            dayPatterns: ['MW', 'TR']
        });

        expect(scheduleHasCourses(emptySchedule)).toBe(false);
        expect(scheduleHasCourses(populatedSchedule)).toBe(true);
    });
});
