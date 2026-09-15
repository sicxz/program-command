const SectionRegistrations = (function () {
    'use strict';

    function normalizeCourse(value) {
        return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
    }

    function normalizeQuarter(value) {
        const match = String(value || '').trim().toLowerCase().match(/\b(fall|winter|spring|summer)\b/);
        return match ? match[1] : '';
    }

    function normalizeDays(value, arranged = false) {
        if (arranged) return 'ARRANGED';

        const days = String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
        if (['ONLINE', 'ARRANGED', 'ASYNC', 'ASYNCHRONOUS'].includes(days)) return 'ARRANGED';
        if (['TR', 'TT', 'TTH', 'TUTH'].includes(days)) return 'TR';
        if (days === 'MW') return 'MW';
        return days;
    }

    function normalizeTime(value) {
        const digits = String(value || '').replace(/\D/g, '');
        if (!digits) return '';
        return digits.length === 3 ? `0${digits}` : digits.slice(0, 4);
    }

    function normalizeTimeRange(startTime, endTime) {
        let start = startTime;
        let end = endTime;

        if (!end && typeof start === 'string') {
            const parts = start.split(/\s*[-–—]\s*/);
            if (parts.length === 2) {
                [start, end] = parts;
            }
        }

        return [normalizeTime(start), normalizeTime(end)];
    }

    function forTerm(snapshots, academicYear, quarter) {
        const terms = Array.isArray(snapshots?.terms) ? snapshots.terms : [];
        const targetYear = String(academicYear || '').trim();
        const targetQuarter = normalizeQuarter(quarter);
        const term = terms.find((entry) => (
            String(entry?.academicYear || '').trim() === targetYear
            && normalizeQuarter(entry?.quarter) === targetQuarter
        ));

        return term && Array.isArray(term.sections) ? term.sections : null;
    }

    function match(sections, criteria = {}) {
        if (!Array.isArray(sections)) return null;

        const targetCourse = normalizeCourse(criteria.course);
        const targetDays = normalizeDays(criteria.days);
        const targetTimes = normalizeTimeRange(criteria.startTime, criteria.endTime);

        return sections.find((section) => {
            if (normalizeCourse(section?.course) !== targetCourse) return false;

            const meeting = section?.meeting || {};
            const sectionDays = normalizeDays(meeting.days, meeting.arranged === true);
            if (sectionDays !== targetDays) return false;
            if (targetDays === 'ARRANGED') return true;

            const sectionTimes = normalizeTimeRange(meeting.beginTime, meeting.endTime);
            return sectionTimes[0] === targetTimes[0] && sectionTimes[1] === targetTimes[1];
        }) || null;
    }

    function status(enrolled, cap) {
        const enrolledCount = Number(enrolled);
        const capCount = Number(cap);
        return {
            enrolled: enrolledCount,
            cap: capCount,
            over: Math.max(0, enrolledCount - capCount),
            overload: enrolledCount > capCount
        };
    }

    return { forTerm, match, status };
})();

if (typeof window !== 'undefined') window.SectionRegistrations = SectionRegistrations;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SectionRegistrations;
}
