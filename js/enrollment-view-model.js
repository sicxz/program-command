/**
 * Observed enrollment totals for the Enrollment dashboard.
 * A registration is one course seat, not a unique student. The source's section
 * averages, peaks and trend classifications describe its full historical range.
 */
const EnrollmentViewModel = (function () {
    'use strict';

    const SEASONS = ['Winter', 'Spring', 'Summer', 'Fall'];
    const LEVELS = [
        { key: 'foundation', label: 'Foundation · 100–200' },
        { key: 'intermediate', label: 'Intermediate · 300' },
        { key: 'advanced', label: 'Advanced · 400' }
    ];
    const TRENDS = ['growing', 'stable', 'declining', 'new', 'unknown'];

    function isRecord(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function validCount(value) {
        return typeof value === 'number' && Number.isFinite(value) &&
            Number.isInteger(value) && value >= 0;
    }

    function parseQuarter(key) {
        const match = /^(fall|winter|spring|summer)-(\d{4})$/.exec(key);
        if (!match) return null;
        const season = match[1][0].toUpperCase() + match[1].slice(1);
        const year = Number(match[2]);
        const startYear = season === 'Fall' ? year : year - 1;
        return {
            key,
            label: `${season} ${year}`,
            season,
            year,
            academicYear: `${startYear}-${String(startYear + 1).slice(-2)}`,
            order: year * 4 + SEASONS.indexOf(season)
        };
    }

    function currentTerm(now = new Date(), calendar = null) {
        const date = new Date(now);
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(date);
        const part = name => parts.find(value => value.type === name).value;
        const today = `${part('year')}-${part('month')}-${part('day')}`;
        const terms = (Array.isArray(calendar?.terms) ? calendar.terms : []).filter(term =>
            isRecord(term) &&
            parseQuarter(`${term.quarter}-${term.year}`) &&
            /^\d{4}-\d{2}-\d{2}$/.test(term.start) && /^\d{4}-\d{2}-\d{2}$/.test(term.end) &&
            Number.isFinite(Date.parse(term.start)) && Number.isFinite(Date.parse(term.end)) &&
            term.start <= term.end
        ).sort((a, b) => a.start.localeCompare(b.start));
        const active = terms.find(term => term.start <= today && today <= term.end);
        // Between terms, focus the upcoming quarter for planning, labeled as such.
        const upcoming = !active && terms.some(term => term.end < today) && terms.find(term => today < term.start &&
            (Date.parse(term.start) - Date.parse(today)) / 86400000 <= 60);
        const term = active || upcoming;
        if (term) return {
            ...parseQuarter(`${term.quarter}-${term.year}`),
            quarter: term.quarter, today, start: term.start, end: term.end,
            status: active ? 'current' : 'upcoming', isApproximate: false
        };
        // Outside the published calendar, keep the view useful without claiming exact term dates.
        const month = Number(part('month'));
        const quarter = month <= 3 ? 'winter' : month <= 6 ? 'spring' : month <= 8 ? 'summer' : 'fall';
        return {
            ...parseQuarter(`${quarter}-${part('year')}`), quarter, today,
            start: null, end: null, status: 'estimated', isApproximate: true
        };
    }

    function courseLevel(code) {
        const number = Number(code.match(/\d{3}$/)[0]);
        if (number < 300) return 'foundation';
        if (number < 400) return 'intermediate';
        return 'advanced';
    }

    function normalize(data, catalog) {
        const titles = new Map();
        if (isRecord(catalog) && Array.isArray(catalog.courses)) {
            catalog.courses.forEach(course => {
                if (isRecord(course) && typeof course.code === 'string' &&
                    typeof course.title === 'string') {
                    titles.set(course.code, course.title);
                }
            });
        }
        const quarterMap = new Map();
        const courses = [];
        const stats = isRecord(data) && isRecord(data.courseStats) ? data.courseStats : {};
        Object.entries(stats).forEach(([code, source]) => {
            if (!/^DESN [1-4]\d{2}$/.test(code) || !isRecord(source) ||
                !isRecord(source.quarterly)) return;
            const quarterly = {};
            Object.entries(source.quarterly).forEach(([key, count]) => {
                const quarter = parseQuarter(key);
                if (!quarter || !validCount(count)) return;
                quarterly[key] = count;
                quarterMap.set(key, quarter);
            });
            if (!Object.keys(quarterly).length) return;
            courses.push({
                code,
                title: titles.get(code) || '',
                level: courseLevel(code),
                trend: TRENDS.includes(source.trend) ? source.trend : 'unknown',
                quarterly,
                average: validCount(source.average) ? source.average : null,
                peak: validCount(source.peak) ? source.peak : null,
                peakQuarter: parseQuarter(source.peakQuarter || '')?.label || null
            });
        });
        return {
            courses,
            quarters: [...quarterMap.values()].sort((a, b) => a.order - b.order)
        };
    }

    function coverageFor(quarters, year) {
        const summerQuarterCount = quarters.filter(q => q.season === 'Summer').length;
        const coreQuarterCount = quarters.length - summerQuarterCount;
        const yearCount = year === 'all' ? new Set(quarters.map(q => q.academicYear)).size : 1;
        const expectedQuarters = yearCount * 3;
        const complete = expectedQuarters > 0 && coreQuarterCount === expectedQuarters;
        const coreSeasons = quarters.filter(q => q.season !== 'Summer').map(q => q.season);
        let label = `${coreQuarterCount} of ${expectedQuarters} quarters`;
        if (year !== 'all' && coreQuarterCount === 1) label = `${coreSeasons[0]} only`;
        if (!quarters.length) label = 'No observed quarters';
        if (summerQuarterCount) label += ` · ${summerQuarterCount} summer ${summerQuarterCount === 1 ? 'quarter' : 'quarters'}`;
        return { quarterCount: quarters.length, coreQuarterCount, summerQuarterCount, expectedQuarters, complete, label };
    }

    function metadata(data, normalized) {
        const years = [...new Set(normalized.quarters.map(q => q.academicYear))]
            .sort().reverse().map(value => {
                const quarters = normalized.quarters.filter(q => q.academicYear === value);
                const coverage = coverageFor(quarters, value);
                return {
                    value,
                    label: value.replace('-', '–') + (coverage.complete ? '' : ` · ${coverage.label}`),
                    quarterKeys: quarters.map(q => q.key),
                    complete: coverage.complete
                };
            });
        const generatedAt = isRecord(data) ? data.generatedAt : null;
        const sourceDate = typeof generatedAt === 'string' && Number.isFinite(Date.parse(generatedAt)) ? generatedAt : null;
        return {
            years,
            defaultYear: years.find(year => year.complete)?.value || years[0]?.value || 'all',
            sourceDate,
            firstQuarter: normalized.quarters[0]?.label || null,
            lastQuarter: normalized.quarters[normalized.quarters.length - 1]?.label || null
        };
    }

    function sumQuarters(courses, keys) {
        return courses.reduce((sum, course) => sum + keys.reduce((total, key) =>
            total + (course.quarterly[key] ?? 0), 0), 0);
    }

    function hasObservation(course, keys) {
        return keys.some(key => Object.prototype.hasOwnProperty.call(course.quarterly, key));
    }

    function recordedQuarterTotal(courses, key) {
        return courses.some(course => hasObservation(course, [key])) ? sumQuarters(courses, [key]) : null;
    }

    function change(current, previous) {
        return {
            delta: current - previous,
            percent: previous === 0 ? null : ((current - previous) / previous) * 100
        };
    }

    function comparePeriod(courses, quarters, allQuarters, year) {
        if (year === 'all' || !quarters.length) return null;
        const keys = quarters.map(q => q.key);
        const previousKeys = quarters.map(q => `${q.season.toLowerCase()}-${q.year - 1}`);
        const knownKeys = new Set(allQuarters.map(q => q.key));
        if (!previousKeys.every(key => knownKeys.has(key)) ||
            ![...keys, ...previousKeys].every(key => courses.some(course => hasObservation(course, [key])))) return null;
        const current = sumQuarters(courses, keys);
        const previous = sumQuarters(courses, previousKeys);
        const startYear = Number(year.slice(0, 4));
        const previousYear = `${startYear - 1}-${String(startYear).slice(-2)}`;
        return {
            current,
            previous,
            ...change(current, previous),
            year,
            previousYear,
            label: `${year.replace('-', '–')} vs ${previousYear.replace('-', '–')} · matching quarters`,
            quarterKeys: keys,
            previousQuarterKeys: previousKeys,
            quarters: quarters.map((quarter, index) => ({
                season: quarter.season,
                label: quarter.season,
                current: sumQuarters(courses, [quarter.key]),
                previous: sumQuarters(courses, [previousKeys[index]])
            }))
        };
    }

    function quarterHistory(courses, allQuarters, quarter) {
        const season = quarter[0].toUpperCase() + quarter.slice(1);
        const historyQuarters = allQuarters.filter(q => q.season === season);
        const keys = historyQuarters.map(q => q.key);
        const rows = courses.filter(course => hasObservation(course, keys))
            .map(course => {
                const values = keys.map(key => course.quarterly[key] ?? null);
                const first = values[0];
                const last = values[values.length - 1];
                const changes = values.length > 1 && first !== null && last !== null ?
                    change(last, first) : { delta: null, percent: null };
                return { code: course.code, title: course.title, values, ...changes };
            }).sort((a, b) => a.code.localeCompare(b.code));
        return {
            quarter, season,
            years: historyQuarters.map(q => q.year),
            rows,
            totals: keys.map(key => recordedQuarterTotal(courses, key)),
            first: historyQuarters[0]?.year || null,
            last: historyQuarters[historyQuarters.length - 1]?.year || null
        };
    }

    function create(data, catalog) {
        return metadata(data, normalize(data, catalog));
    }

    function build(data, catalog, options = {}) {
        const normalized = normalize(data, catalog);
        const meta = metadata(data, normalized);
        const settings = isRecord(options) ? options : {};
        const term = currentTerm(settings.now, settings.calendar);
        const year = settings.year === 'current' ? term.academicYear :
            settings.year === 'all' || meta.years.some(item => item.value === settings.year) ? settings.year : meta.defaultYear;
        const quarter = SEASONS.some(season => season.toLowerCase() === settings.quarter) ? settings.quarter : term.quarter;
        const level = LEVELS.some(item => item.key === settings.level) ? settings.level : 'all';
        const trend = TRENDS.includes(settings.trend) ? settings.trend : 'all';
        const matchingCourses = normalized.courses.filter(course =>
            (level === 'all' || course.level === level) && (trend === 'all' || course.trend === trend));
        const selectedQuarters = normalized.quarters.filter(quarter => year === 'all' || quarter.academicYear === year);
        const keys = selectedQuarters.map(q => q.key);
        const courses = matchingCourses.filter(course => hasObservation(course, keys))
            .map(course => ({
                ...course,
                quarterly: Object.fromEntries(keys.map(key => [key, course.quarterly[key] ?? null])),
                periodTotal: sumQuarters([course], keys)
            })).sort((a, b) => b.periodTotal - a.periodTotal || a.code.localeCompare(b.code));
        const quarters = selectedQuarters.map(quarter => ({
            key: quarter.key,
            label: quarter.label,
            season: quarter.season,
            year: quarter.year,
            total: recordedQuarterTotal(matchingCourses, quarter.key)
        }));
        const trendCounts = Object.fromEntries(TRENDS.map(key => [key, 0]));
        courses.forEach(course => trendCounts[course.trend]++);
        return {
            selection: { year, level, trend, quarter },
            term,
            currentTermHasRecords: normalized.quarters.some(quarter => quarter.key === term.key),
            hasData: courses.length > 0,
            courses,
            quarters,
            totalRegistrations: courses.reduce((sum, course) => sum + course.periodTotal, 0),
            courseCount: courses.length,
            coverage: coverageFor(selectedQuarters, year),
            comparison: comparePeriod(matchingCourses, selectedQuarters, normalized.quarters, year),
            levelTotals: LEVELS.map(item => ({
                ...item,
                total: courses.filter(course => course.level === item.key).reduce((sum, course) => sum + course.periodTotal, 0)
            })),
            trendCounts,
            history: quarterHistory(matchingCourses, normalized.quarters, quarter)
        };
    }

    return { create, build, currentTerm };
})();

if (typeof window !== 'undefined') window.EnrollmentViewModel = EnrollmentViewModel;
if (typeof module !== 'undefined' && module.exports) module.exports = EnrollmentViewModel;
