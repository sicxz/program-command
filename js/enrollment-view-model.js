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

    function pacificCalendarDay(now) {
        const date = new Date(now);
        if (!Number.isFinite(date.getTime())) return null;
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(date);
        const part = name => parts.find(value => value.type === name)?.value;
        return `${part('year')}-${part('month')}-${part('day')}`;
    }

    function computeTrend({ history, current, calendar, now } = {}) {
        const observations = new Map();
        if (isRecord(history)) {
            Object.entries(history).forEach(([key, count]) => {
                const quarter = parseQuarter(key);
                if (quarter && validCount(count)) observations.set(key, { ...quarter, count });
            });
        }

        const terms = Array.isArray(current?.terms) ? current.terms :
            Array.isArray(current) ? current : isRecord(current) ? [current] : [];
        terms.forEach(term => {
            if (!isRecord(term)) return;
            const key = parseQuarter(term.quarter || term.key || '')?.key ||
                (typeof term.quarter === 'string' && Number.isInteger(term.year)
                    ? `${term.quarter.toLowerCase()}-${term.year}` : null);
            const quarter = key && parseQuarter(key);
            if (!quarter) return;
            let count = validCount(term.count) ? term.count : null;
            if (Array.isArray(term.sections) && term.sections.length) {
                const enrolled = term.sections.map(section => section?.enrolled).filter(validCount);
                if (enrolled.length) count = enrolled.reduce((sum, value) => sum + value, 0);
            }
            if (validCount(count)) observations.set(key, { ...quarter, count });
        });

        const latest = [...observations.values()].sort((a, b) => b.order - a.order)[0];
        if (!latest) {
            return { trend: null, registering: false, latestTerm: null, latestCount: null,
                priorTerm: null, priorCount: null, delta: null };
        }
        const expectedPriorTerm = `${latest.season.toLowerCase()}-${latest.year - 1}`;
        const prior = observations.get(expectedPriorTerm) || null;
        const delta = prior ? latest.count - prior.count : null;
        let trend = !prior ? 'new' : delta >= 3 ? 'growing' : delta <= -3 ? 'declining' : 'stable';

        const calendarTerm = (Array.isArray(calendar?.terms) ? calendar.terms : []).find(term =>
            isRecord(term) && `${String(term.quarter).toLowerCase()}-${term.year}` === latest.key &&
            /^\d{4}-\d{2}-\d{2}$/.test(term.start));
        const today = pacificCalendarDay(now);
        const registering = Boolean(calendarTerm && today && calendarTerm.start > today);

        return {
            trend,
            registering,
            latestTerm: latest.key,
            latestCount: latest.count,
            priorTerm: prior?.key || null,
            priorCount: prior?.count ?? null,
            delta
        };
    }

    function courseLevel(code) {
        const number = Number(code.match(/\d{3}$/)[0]);
        if (number < 300) return 'foundation';
        if (number < 400) return 'intermediate';
        return 'advanced';
    }

    function normalize(data, catalog, snapshots = null, calendar = null, now = undefined) {
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
                storedTrend: TRENDS.includes(source.trend) ? source.trend : 'unknown',
                history: { ...quarterly },
                quarterly,
                average: validCount(source.average) ? source.average : null,
                peak: validCount(source.peak) ? source.peak : null,
                peakQuarter: parseQuarter(source.peakQuarter || '')?.label || null
            });
        });
        // Only this view overlays registration captures. Planning engines continue to
        // consume the unchanged historical dataset, never provisional registrations.
        const captures = readSnapshots(snapshots);
        captures.forEach(capture => {
            courses.forEach(course => { delete course.quarterly[capture.key]; });
            capture.sections.forEach(section => {
                let course = courses.find(item => item.code === section.course);
                if (!course) {
                    course = { code: section.course, title: titles.get(section.course) || section.title,
                        level: courseLevel(section.course), storedTrend: 'unknown', history: {}, quarterly: {},
                        average: null, peak: null, peakQuarter: null };
                    courses.push(course);
                }
                course.quarterly[capture.key] = (course.quarterly[capture.key] ?? 0) + section.enrolled;
            });
            quarterMap.set(capture.key, capture);
        });
        courses.forEach(course => {
            const current = { terms: captures.map(capture => ({
                quarter: capture.key,
                academicYear: capture.academicYear,
                status: capture.provisional ? 'provisional' : 'completed',
                sections: capture.sections.filter(section => section.course === course.code)
                    .map(section => ({ enrolled: section.enrolled }))
            })).filter(term => term.sections.length) };
            const trendComparison = computeTrend({ history: course.history, current, calendar, now });
            course.trend = trendComparison.trend ?? course.storedTrend;
            course.registering = trendComparison.registering;
            course.trendComparison = trendComparison;
            delete course.history;
        });
        return {
            courses,
            captures,
            quarters: [...quarterMap.values()].sort((a, b) => a.order - b.order)
        };
    }

    function readSnapshots(bundle) {
        if (bundle === null || bundle === undefined) return [];
        if (!isRecord(bundle) || bundle.schemaVersion !== 1 || !Array.isArray(bundle.terms)) {
            throw new Error('Invalid enrollment registration snapshot format.');
        }
        const knownTerms = new Set();
        return bundle.terms.map(term => {
            const quarter = isRecord(term) && parseQuarter(term.quarter);
            if (!quarter || knownTerms.has(quarter.key) || term.academicYear !== quarter.academicYear ||
                !['completed', 'provisional', 'scheduled'].includes(term.status) ||
                typeof term.observedAt !== 'string' || !Number.isFinite(Date.parse(term.observedAt)) ||
                term.completeSearch !== true || !validCount(term.expectedSections) ||
                !Array.isArray(term.sections) || term.sections.length !== term.expectedSections) {
                throw new Error('Incomplete or invalid enrollment term capture.');
            }
            knownTerms.add(quarter.key);
            const crns = new Set();
            const sections = term.sections.map(section => {
                if (!isRecord(section) || !/^DESN [1-4]\d{2}$/.test(section.course) ||
                    typeof section.crn !== 'string' || !/^\d{5}$/.test(section.crn) || crns.has(section.crn) ||
                    typeof section.title !== 'string' || typeof section.section !== 'string' ||
                    !validCount(section.capacity) || !Number.isInteger(section.available) ||
                    !validCount(section.capacity - section.available) ||
                    !(section.waitlisted === null || validCount(section.waitlisted))) {
                    throw new Error('Invalid or duplicate enrollment section capture.');
                }
                crns.add(section.crn);
                return { ...section, enrolled: section.capacity - section.available };
            });
            if (term.status === 'scheduled') return null;
            return { ...quarter, observedAt: term.observedAt, termCode: term.termCode,
                provisional: term.status === 'provisional', sections,
                total: sections.reduce((sum, section) => sum + section.enrolled, 0),
                capacity: sections.reduce((sum, section) => sum + section.capacity, 0),
                waitlisted: sections.reduce((sum, section) => sum + (section.waitlisted ?? 0), 0),
                missingWaitlists: sections.filter(section => section.waitlisted === null).length };
        }).filter(Boolean).sort((a, b) => a.order - b.order);
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
            captures: normalized.captures,
            lastQuarterProvisional: !!normalized.quarters[normalized.quarters.length - 1]?.provisional,
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
        if (allQuarters.some(q => q.provisional && [...keys, ...previousKeys].includes(q.key))) return null;
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
        const comparableEndpoints = !historyQuarters[0]?.provisional && !historyQuarters[historyQuarters.length - 1]?.provisional;
        const rows = courses.filter(course => hasObservation(course, keys))
            .map(course => {
                const values = keys.map(key => course.quarterly[key] ?? null);
                const first = values[0];
                const last = values[values.length - 1];
                const changes = comparableEndpoints && values.length > 1 && first !== null && last !== null ?
                    change(last, first) : { delta: null, percent: null };
                return { code: course.code, title: course.title, values, ...changes };
            }).sort((a, b) => a.code.localeCompare(b.code));
        return {
            quarter, season,
            years: historyQuarters.map(q => q.year),
            provisional: historyQuarters.map(q => !!q.provisional),
            observedAt: historyQuarters.map(q => q.observedAt || null),
            comparableEndpoints,
            rows,
            totals: keys.map(key => recordedQuarterTotal(courses, key)),
            first: historyQuarters[0]?.year || null,
            last: historyQuarters[historyQuarters.length - 1]?.year || null
        };
    }

    function create(data, catalog, snapshots) {
        return metadata(data, normalize(data, catalog, snapshots));
    }

    function build(data, catalog, options = {}) {
        const settings = isRecord(options) ? options : {};
        const now = settings.now === undefined ? new Date() : settings.now;
        const normalized = normalize(data, catalog, settings.snapshots, settings.calendar, now);
        const meta = metadata(data, normalized);
        const term = currentTerm(now, settings.calendar);
        const year = settings.year === 'current' ? term.academicYear :
            settings.year === 'all' || meta.years.some(item => item.value === settings.year) ? settings.year : meta.defaultYear;
        const quarter = SEASONS.some(season => season.toLowerCase() === settings.quarter) ? settings.quarter : term.quarter;
        const level = LEVELS.some(item => item.key === settings.level) ? settings.level : 'all';
        const trend = TRENDS.includes(settings.trend) ? settings.trend : 'all';
        const matchingCourses = normalized.courses.filter(course =>
            (level === 'all' || course.level === level) &&
            (trend === 'all' || course.trend === trend));
        const selectedQuarters = normalized.quarters.filter(quarter => year === 'all' || quarter.academicYear === year);
        const keys = selectedQuarters.map(q => q.key);
        const courses = matchingCourses.filter(course => hasObservation(course, keys))
            .map(course => {
                const { storedTrend, ...publicCourse } = course;
                return {
                    ...publicCourse,
                    quarterly: Object.fromEntries(keys.map(key => [key, course.quarterly[key] ?? null])),
                    periodTotal: sumQuarters([course], keys)
                };
            }).sort((a, b) => b.periodTotal - a.periodTotal || a.code.localeCompare(b.code));
        const quarters = selectedQuarters.map(quarter => ({
            key: quarter.key,
            label: quarter.label,
            season: quarter.season,
            year: quarter.year,
            provisional: !!quarter.provisional,
            total: recordedQuarterTotal(matchingCourses, quarter.key)
        }));
        const trendCounts = { ...Object.fromEntries(TRENDS.map(key => [key, 0])), registering: 0 };
        courses.forEach(course => {
            trendCounts[course.trend]++;
            if (course.registering) trendCounts.registering++;
        });
        return {
            selection: { year, level, trend, quarter },
            term,
            currentTermCapture: normalized.captures.find(capture => capture.key === term.key) || null,
            provisionalQuarters: selectedQuarters.filter(q => q.provisional).map(q => q.label),
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

    return { create, build, currentTerm, readSnapshots, computeTrend };
})();

if (typeof window !== 'undefined') window.EnrollmentViewModel = EnrollmentViewModel;
if (typeof module !== 'undefined' && module.exports) module.exports = EnrollmentViewModel;
