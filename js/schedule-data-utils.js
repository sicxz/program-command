(function(root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
        return;
    }

    root.ScheduleDataUtils = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    const TOP_LEVEL_ONLINE_KEYS = ['ONLINE', 'online', 'ASYNC', 'async', 'ASYNCHRONOUS', 'asynchronous'];
    const ONLINE_BUCKET_KEY_PATTERN = /^(async|asynchronous|asynch|online|web)$/i;

    function isObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    }

    function appendCourseList(target, seen, value) {
        if (!Array.isArray(value)) return;

        value.forEach((course) => {
            if (!course || typeof course !== 'object') return;
            if (seen.has(course)) return;
            seen.add(course);

            if (!String(course.room || '').trim()) {
                course.room = 'ONLINE';
            }

            target.push(course);
        });
    }

    function ensureOnlineCourseBucketForQuarter(quarterData) {
        if (!isObject(quarterData)) {
            return [];
        }

        const seen = new Set();
        const onlineCourses = [];

        TOP_LEVEL_ONLINE_KEYS.forEach((containerKey) => {
            const container = quarterData[containerKey];

            if (Array.isArray(container)) {
                appendCourseList(onlineCourses, seen, container);
                return;
            }

            if (!isObject(container)) {
                return;
            }

            Object.entries(container).forEach(([bucketKey, bucketValue]) => {
                if (ONLINE_BUCKET_KEY_PATTERN.test(String(bucketKey || '').trim())) {
                    appendCourseList(onlineCourses, seen, bucketValue);
                }
            });
        });

        if (!isObject(quarterData.ONLINE)) {
            quarterData.ONLINE = {};
        }

        quarterData.ONLINE.async = onlineCourses;

        Object.keys(quarterData.ONLINE).forEach((bucketKey) => {
            if (bucketKey !== 'async' && ONLINE_BUCKET_KEY_PATTERN.test(String(bucketKey || '').trim())) {
                delete quarterData.ONLINE[bucketKey];
            }
        });

        TOP_LEVEL_ONLINE_KEYS.forEach((containerKey) => {
            if (containerKey !== 'ONLINE') {
                delete quarterData[containerKey];
            }
        });

        return quarterData.ONLINE.async;
    }

    function getOnlineCoursesForQuarter(quarterData) {
        return ensureOnlineCourseBucketForQuarter(quarterData);
    }

    function flattenQuarterData(quarterData) {
        if (!isObject(quarterData)) {
            return [];
        }

        ensureOnlineCourseBucketForQuarter(quarterData);

        const courses = [];
        Object.keys(quarterData).forEach((day) => {
            const dayData = quarterData[day];
            if (!isObject(dayData)) return;

            Object.keys(dayData).forEach((time) => {
                const timeCourses = dayData[time];
                if (!Array.isArray(timeCourses)) return;

                timeCourses.forEach((course) => {
                    if (!course || typeof course !== 'object') return;

                    courses.push({
                        ...course,
                        room: day === 'ONLINE' ? (course.room || 'ONLINE') : course.room,
                        day,
                        time
                    });
                });
            });
        });

        return courses;
    }

    return {
        ensureOnlineCourseBucketForQuarter,
        getOnlineCoursesForQuarter,
        flattenQuarterData
    };
});
