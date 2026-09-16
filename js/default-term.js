/** Resolve the initial academic term from the admin setting or academic calendar. */
const DefaultTerm = (function () {
    'use strict';

    const PINNED_QUARTERS = new Set(['fall', 'winter', 'spring']);
    const DAY_MS = 86400000;

    function isRecord(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function academicYear(startYear) {
        return `${startYear}-${String(startYear + 1).slice(-2)}`;
    }

    function validAcademicYear(value) {
        return /^\d{4}-\d{2}$/.test(String(value || ''));
    }

    function dateParts(now) {
        const candidate = new Date(now);
        const date = Number.isFinite(candidate.getTime()) ? candidate : new Date();
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Los_Angeles',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(date);
        const part = name => parts.find(value => value.type === name)?.value;
        return {
            year: Number(part('year')),
            month: Number(part('month')),
            today: `${part('year')}-${part('month')}-${part('day')}`
        };
    }

    function parseCalendarTerm(term) {
        if (!isRecord(term)) return null;
        const quarter = String(term.quarter || '').toLowerCase();
        const year = Number(term.year);
        if (!['fall', 'winter', 'spring', 'summer'].includes(quarter) ||
            !Number.isInteger(year) ||
            !/^\d{4}-\d{2}-\d{2}$/.test(term.start) ||
            !/^\d{4}-\d{2}-\d{2}$/.test(term.end) ||
            !Number.isFinite(Date.parse(term.start)) ||
            !Number.isFinite(Date.parse(term.end)) ||
            term.start > term.end) {
            return null;
        }
        const startYear = quarter === 'fall' ? year : year - 1;
        return { ...term, quarter, academicYear: academicYear(startYear) };
    }

    function inlineCalendarTerm(now, calendar) {
        const { today, year, month } = dateParts(now);
        const terms = (Array.isArray(calendar?.terms) ? calendar.terms : [])
            .map(parseCalendarTerm)
            .filter(Boolean)
            .sort((a, b) => a.start.localeCompare(b.start));
        if (terms.length === 0) return null;
        const active = terms.find(term => term.start <= today && today <= term.end);
        const upcoming = !active && terms.some(term => term.end < today)
            ? terms.find(term => today < term.start &&
                (Date.parse(term.start) - Date.parse(today)) / DAY_MS <= 60)
            : null;
        const term = active || upcoming;
        if (term) return { academicYear: term.academicYear, quarter: term.quarter };

        const quarter = month <= 3 ? 'winter' : month <= 6 ? 'spring' : month <= 8 ? 'summer' : 'fall';
        const startYear = quarter === 'fall' ? year : year - 1;
        return { academicYear: academicYear(startYear), quarter };
    }

    function calendarTerm(now, calendar) {
        if (!Array.isArray(calendar?.terms) || !calendar.terms.some(term => parseCalendarTerm(term))) return null;
        try {
            const viewModel = typeof globalThis !== 'undefined'
                ? globalThis.EnrollmentViewModel
                : null;
            if (viewModel && typeof viewModel.currentTerm === 'function') {
                const term = viewModel.currentTerm(now, calendar);
                const academicYearValue = term?.academicYear;
                const quarter = String(term?.quarter || '').toLowerCase();
                if (validAcademicYear(academicYearValue) &&
                    ['fall', 'winter', 'spring', 'summer'].includes(quarter)) {
                    return { academicYear: academicYearValue, quarter };
                }
            }
        } catch (error) {
            // Fall through to the matching inline calendar rule.
        }
        return inlineCalendarTerm(now, calendar);
    }

    function fallbackTerm(now) {
        const { year, month } = dateParts(now);
        const startYear = month >= 9 ? year : year - 1;
        const quarter = month <= 3 ? 'winter' : month <= 6 ? 'spring' : month <= 8 ? 'summer' : 'fall';
        return { academicYear: academicYear(startYear), quarter, source: 'fallback' };
    }

    function nextFall(term) {
        const startYear = Number.parseInt(String(term.academicYear).split('-')[0], 10);
        if (!Number.isInteger(startYear)) return null;
        return { academicYear: academicYear(startYear + 1), quarter: 'fall', source: 'calendar' };
    }

    function resolve(options = {}) {
        try {
            const pinned = isRecord(options) && isRecord(options.pinned) ? options.pinned : null;
            const pinnedQuarter = String(pinned?.quarter || '').toLowerCase();
            if (pinned && validAcademicYear(pinned.academicYear) && PINNED_QUARTERS.has(pinnedQuarter)) {
                return { academicYear: pinned.academicYear, quarter: pinnedQuarter, source: 'setting' };
            }

            const now = isRecord(options) && options.now !== undefined ? options.now : new Date();
            const term = calendarTerm(now, isRecord(options) ? options.calendar : null);
            if (term) {
                if (term.quarter === 'summer' && options.allowSummer !== true) {
                    return nextFall(term) || fallbackTerm(now);
                }
                return { ...term, source: 'calendar' };
            }
            const fallback = fallbackTerm(now);
            if (fallback.quarter === 'summer' && options.allowSummer !== true) {
                const fall = nextFall(fallback);
                return fall ? { ...fall, source: 'fallback' } : fallback;
            }
            return fallback;
        } catch (error) {
            try {
                return fallbackTerm(new Date());
            } catch (fallbackError) {
                return null;
            }
        }
    }

    return { resolve };
})();

if (typeof window !== 'undefined') window.DefaultTerm = DefaultTerm;
if (typeof module !== 'undefined' && module.exports) module.exports = DefaultTerm;
