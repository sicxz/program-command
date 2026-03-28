(function schedulePersistenceRuntime(globalScope) {
    'use strict';

    const QUARTERS = ['fall', 'winter', 'spring'];

    function normalizeText(value) {
        return String(value == null ? '' : value).trim();
    }

    function normalizeCourseCode(value) {
        return normalizeText(value)
            .toUpperCase()
            .replace(/\s+/g, ' ');
    }

    function normalizeQuarter(value) {
        const quarter = normalizeText(value).toLowerCase();
        return QUARTERS.includes(quarter) ? quarter : '';
    }

    function createEmptyQuarterBucket() {
        return {
            ONLINE: { async: [] },
            ARRANGED: { arranged: [] }
        };
    }

    function createEmptyAcademicYearScheduleData() {
        return {
            fall: createEmptyQuarterBucket(),
            winter: createEmptyQuarterBucket(),
            spring: createEmptyQuarterBucket()
        };
    }

    function ensureSlotBucket(quarterBucket, dayPattern, timeSlot) {
        if (!quarterBucket[dayPattern] || typeof quarterBucket[dayPattern] !== 'object') {
            quarterBucket[dayPattern] = {};
        }
        if (!Array.isArray(quarterBucket[dayPattern][timeSlot])) {
            quarterBucket[dayPattern][timeSlot] = [];
        }
        return quarterBucket[dayPattern][timeSlot];
    }

    function resolveStoredRoom(row, dayPattern, timeSlot) {
        const roomCode = normalizeText(row?.room?.room_code).toUpperCase();
        if (roomCode) return roomCode;
        if (dayPattern === 'ONLINE' || timeSlot === 'async') return 'ONLINE';
        if (dayPattern === 'ARRANGED' || timeSlot === 'arranged') return 'ARRANGED';
        return 'TBD';
    }

    function buildCourseFromDatabaseRow(row, dayPattern, timeSlot) {
        return {
            code: normalizeCourseCode(row?.course?.code || ''),
            name: normalizeText(row?.course?.title || ''),
            instructor: normalizeText(row?.faculty?.name || 'TBD') || 'TBD',
            credits: Number(row?.course?.default_credits) || 5,
            room: resolveStoredRoom(row, dayPattern, timeSlot),
            section: normalizeText(row?.section || ''),
            enrollmentCap: Number.isFinite(Number(row?.projected_enrollment))
                ? Number(row.projected_enrollment)
                : null
        };
    }

    function buildScheduleSnapshotFromDatabaseRows(rows) {
        const schedule = createEmptyAcademicYearScheduleData();

        (Array.isArray(rows) ? rows : []).forEach((row) => {
            const quarter = normalizeQuarter(row?.quarter);
            if (!quarter) return;

            const dayPattern = normalizeText(row?.day_pattern) || (normalizeText(row?.time_slot) === 'async' ? 'ONLINE' : '');
            const timeSlot = normalizeText(row?.time_slot) || (dayPattern === 'ONLINE' ? 'async' : '');
            if (!dayPattern || !timeSlot) return;

            const slot = ensureSlotBucket(schedule[quarter], dayPattern, timeSlot);
            slot.push(buildCourseFromDatabaseRow(row, dayPattern, timeSlot));
        });

        return schedule;
    }

    function countScheduleCourses(scheduleStore) {
        return QUARTERS.reduce((total, quarter) => {
            const quarterData = scheduleStore?.[quarter];
            if (!quarterData || typeof quarterData !== 'object') return total;

            return total + Object.values(quarterData).reduce((quarterTotal, dayBucket) => {
                if (!dayBucket || typeof dayBucket !== 'object') return quarterTotal;
                return quarterTotal + Object.values(dayBucket).reduce((slotTotal, courses) => {
                    return slotTotal + (Array.isArray(courses) ? courses.length : 0);
                }, 0);
            }, 0);
        }, 0);
    }

    const api = {
        buildScheduleSnapshotFromDatabaseRows,
        countScheduleCourses,
        createEmptyAcademicYearScheduleData
    };

    globalScope.SchedulePersistence = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
