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
    const DEFAULT_QUARTERS = ['fall', 'winter', 'spring'];

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

    function ensureArrangedCourseBucketForQuarter(quarterData) {
        if (!isObject(quarterData)) {
            return [];
        }

        if (!isObject(quarterData.ARRANGED)) {
            quarterData.ARRANGED = {};
        }

        if (!Array.isArray(quarterData.ARRANGED.arranged)) {
            quarterData.ARRANGED.arranged = [];
        }

        return quarterData.ARRANGED.arranged;
    }

    function createEmptyQuarterScheduleBucket(dayPatterns) {
        const bucket = {
            ONLINE: { async: [] },
            ARRANGED: { arranged: [] }
        };

        (Array.isArray(dayPatterns) ? dayPatterns : []).forEach((dayPattern) => {
            const key = String(dayPattern || '').trim();
            if (!key || key === 'ONLINE' || key === 'ARRANGED') return;
            bucket[key] = {};
        });

        return bucket;
    }

    function createEmptyAcademicYearScheduleData(options) {
        const normalizedOptions = isObject(options) ? options : {};
        const quarters = Array.isArray(normalizedOptions.quarters) && normalizedOptions.quarters.length
            ? normalizedOptions.quarters
            : DEFAULT_QUARTERS;
        const dayPatterns = Array.isArray(normalizedOptions.dayPatterns)
            ? normalizedOptions.dayPatterns
            : [];
        const schedule = {};

        quarters.forEach((quarter) => {
            const quarterKey = String(quarter || '').trim().toLowerCase();
            if (!quarterKey) return;
            schedule[quarterKey] = createEmptyQuarterScheduleBucket(dayPatterns);
        });

        return schedule;
    }

    function scheduleHasCourses(scheduleData) {
        if (!isObject(scheduleData)) {
            return false;
        }

        return Object.values(scheduleData).some((quarterData) => {
            if (!isObject(quarterData)) return false;
            return flattenQuarterData(quarterData).length > 0;
        });
    }

    function buildScheduleDataFromDatabaseRecords(records, options) {
        const normalizedOptions = isObject(options) ? options : {};
        const normalizeCourseCode = typeof normalizedOptions.normalizeCourseCode === 'function'
            ? normalizedOptions.normalizeCourseCode
            : function(value) {
                return String(value || '').trim();
            };
        const normalizeInstructor = typeof normalizedOptions.normalizeInstructor === 'function'
            ? normalizedOptions.normalizeInstructor
            : function(value) {
                const normalized = String(value || '').trim();
                return normalized || 'TBD';
            };
        const normalizeRoom = typeof normalizedOptions.normalizeRoom === 'function'
            ? normalizedOptions.normalizeRoom
            : function(value) {
                return String(value || '').trim();
            };
        const quarters = Array.isArray(normalizedOptions.quarters) && normalizedOptions.quarters.length
            ? normalizedOptions.quarters
            : DEFAULT_QUARTERS;
        const dayPatterns = Array.isArray(normalizedOptions.dayPatterns)
            ? normalizedOptions.dayPatterns
            : [];
        const schedule = createEmptyAcademicYearScheduleData({ quarters, dayPatterns });

        (Array.isArray(records) ? records : []).forEach((record) => {
            const quarterKey = String(record?.quarter || '').trim().toLowerCase();
            if (!quarterKey) return;

            if (!isObject(schedule[quarterKey])) {
                schedule[quarterKey] = createEmptyQuarterScheduleBucket(dayPatterns);
            }

            const quarterData = schedule[quarterKey];
            const code = normalizeCourseCode(record?.course?.code || record?.code || record?.course_code || '');
            if (!code) return;

            const title = String(record?.course?.title || record?.title || record?.name || code).trim();
            const instructor = normalizeInstructor(record?.faculty?.name || record?.instructor || 'TBD');
            const credits = Number(record?.course?.default_credits ?? record?.credits);
            const projectedEnrollment = Number(record?.projected_enrollment ?? record?.projectedEnrollment);
            const baseCourse = {
                code,
                name: title,
                instructor,
                credits: Number.isFinite(credits) && credits > 0 ? credits : 5,
                section: String(record?.section || '').trim()
            };

            if (Number.isFinite(projectedEnrollment)) {
                baseCourse.enrollmentCap = projectedEnrollment;
            }

            const dayPattern = String(record?.day_pattern || record?.day || '').trim().toUpperCase();
            const timeSlot = String(record?.time_slot || record?.time || '').trim();

            if (dayPattern === 'ONLINE') {
                ensureOnlineCourseBucketForQuarter(quarterData).push({
                    ...baseCourse,
                    room: 'ONLINE'
                });
                return;
            }

            if (dayPattern === 'ARRANGED') {
                ensureArrangedCourseBucketForQuarter(quarterData).push({
                    ...baseCourse,
                    room: 'ARRANGED'
                });
                return;
            }

            if (!dayPattern) return;

            if (!isObject(quarterData[dayPattern])) {
                quarterData[dayPattern] = {};
            }

            if (!Array.isArray(quarterData[dayPattern][timeSlot])) {
                quarterData[dayPattern][timeSlot] = [];
            }

            quarterData[dayPattern][timeSlot].push({
                ...baseCourse,
                room: normalizeRoom(record?.room?.room_code || record?.room_code || record?.room || 'TBD') || 'TBD'
            });
        });

        Object.keys(schedule).forEach((quarterKey) => {
            ensureOnlineCourseBucketForQuarter(schedule[quarterKey]);
            ensureArrangedCourseBucketForQuarter(schedule[quarterKey]);
        });

        return schedule;
    }

    function flattenQuarterData(quarterData) {
        if (!isObject(quarterData)) {
            return [];
        }

        ensureOnlineCourseBucketForQuarter(quarterData);
        ensureArrangedCourseBucketForQuarter(quarterData);

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
        buildScheduleDataFromDatabaseRecords,
        createEmptyAcademicYearScheduleData,
        ensureOnlineCourseBucketForQuarter,
        getOnlineCoursesForQuarter,
        flattenQuarterData,
        scheduleHasCourses
    };
});
