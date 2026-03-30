const {
    ensureOnlineCourseBucketForQuarter,
    getOnlineCoursesForQuarter,
    flattenQuarterData
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
});
