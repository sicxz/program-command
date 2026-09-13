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

    function winterHistory(courses, allQuarters) {
        const winters = allQuarters.filter(q => q.season === 'Winter');
        const keys = winters.map(q => q.key);
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
            years: winters.map(q => q.year),
            rows,
            totals: keys.map(key => recordedQuarterTotal(courses, key)),
            first: winters[0]?.year || null,
            last: winters[winters.length - 1]?.year || null
        };
    }

    function create(data, catalog) {
        return metadata(data, normalize(data, catalog));
    }

    function build(data, catalog, options = {}) {
        const normalized = normalize(data, catalog);
        const meta = metadata(data, normalized);
        const settings = isRecord(options) ? options : {};
        const year = settings.year === 'all' || meta.years.some(item => item.value === settings.year) ? settings.year : meta.defaultYear;
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
            selection: { year, level, trend },
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
            winter: winterHistory(matchingCourses, normalized.quarters)
        };
    }

    return { create, build };
})();

if (typeof window !== 'undefined') window.EnrollmentViewModel = EnrollmentViewModel;
if (typeof module !== 'undefined' && module.exports) module.exports = EnrollmentViewModel;
