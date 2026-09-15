/** Registrations and supervised workload have distinct sources and units. */
const AppliedLearningViewModel = (function() {
    'use strict';

    const SEASONS = ['Fall', 'Winter', 'Spring', 'Summer'];
    const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const code = value => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
    const round = value => Number(value.toFixed(3));

    function numeric(value) {
        return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
    }

    function sum(values) {
        return values.length && values.every(value => value !== null)
            ? round(values.reduce((total, value) => total + value, 0)) : null;
    }

    function quarterName(value) {
        return SEASONS.find(season => season.toLowerCase() === String(value || '').trim().toLowerCase()) || null;
    }

    function quarterData(quarter) {
        const match = /^(fall|winter|spring|summer)-(\d{4})$/.exec(String(quarter.key || ''));
        if (!match) return null;
        const season = quarterName(match[1]);
        const year = Number(match[2]);
        const startYear = season === 'Fall' ? year : year - 1;
        return {
            key: quarter.key, label: quarter.label || `${season} ${year}`, season,
            academicYear: `${startYear}-${String(startYear + 1).slice(-2)}`,
            provisional: quarter.provisional === true,
            order: year * 4 + ['Winter', 'Spring', 'Summer', 'Fall'].indexOf(season)
        };
    }

    function configuredCourses(courses, selected) {
        const found = new Map();
        (Array.isArray(courses) ? courses : []).forEach(course => {
            if (!isObject(course)) return;
            const key = code(course.code);
            if (!key || found.has(key) || (selected !== 'all' && selected !== key)) return;
            found.set(key, { code: key, title: String(course.title || ''), rate: numeric(course.rate) });
        });
        return [...found.values()];
    }

    function registrations(enrollment, configured, year, quarter) {
        const available = new Map();
        (Array.isArray(enrollment?.quarters) ? enrollment.quarters : []).forEach(source => {
            const item = quarterData(source);
            if (item && (year === 'all' || item.academicYear === year)
                && (quarter === 'annual' || item.season === quarter)) available.set(item.key, item);
        });
        const quarters = [...available.values()].sort((a, b) => a.order - b.order);
        const sourceCourses = new Map((Array.isArray(enrollment?.courses) ? enrollment.courses : [])
            .filter(isObject).map(course => [code(course.code), course]));
        const courses = configured.map(course => {
            const source = sourceCourses.get(course.code);
            const values = quarters.map(item => {
                const value = numeric(source?.quarterly?.[item.key]);
                return { key: item.key, label: item.label, total: Number.isInteger(value) ? value : null, provisional: item.provisional };
            });
            return { ...course, total: sum(values.map(item => item.total).filter(value => value !== null)), quarters: values };
        });
        const totals = quarters.map(item => {
            const values = courses.map(course => course.quarters.find(value => value.key === item.key).total);
            return {
                key: item.key, label: item.label, season: item.season, academicYear: item.academicYear,
                total: sum(values.filter(value => value !== null)), provisional: item.provisional,
                recordedCourseCount: values.filter(value => value !== null).length
            };
        });
        return {
            total: sum(courses.map(course => course.total).filter(value => value !== null)),
            courses, quarters: totals,
            recordedQuarterCount: totals.filter(item => item.total !== null).length,
            provisionalQuarters: totals.filter(item => item.provisional && item.total !== null).map(item => item.label)
        };
    }

    function facultyRecords(yearData) {
        const faculty = new Map();
        ['all', 'fullTime', 'adjunct', 'former'].forEach(group => {
            Object.entries(isObject(yearData[group]) ? yearData[group] : {}).forEach(([key, record]) => {
                if (!isObject(record)) return;
                const name = String(record.facultyName || key).trim();
                if (!faculty.has(name)) faculty.set(name, record);
            });
        });
        return faculty;
    }

    function byCourseFaculty(rows) {
        const grouped = new Map();
        rows.forEach(row => {
            if (!grouped.has(row.courseCode)) grouped.set(row.courseCode, []);
            grouped.get(row.courseCode).push(row);
        });
        return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([courseCode, records]) => {
            const facultyGroups = new Map();
            records.forEach(record => {
                const key = record.faculty === null ? null : record.faculty;
                if (!facultyGroups.has(key)) facultyGroups.set(key, []);
                facultyGroups.get(key).push(record);
            });
            const faculty = [...facultyGroups.entries()].map(([name, facultyRecords]) => ({
                name: name === null ? 'Unassigned' : name,
                sections: facultyRecords.length,
                credits: sum(facultyRecords.map(record => record.credits)),
                workload: sum(facultyRecords.map(record => record.workloadCredits))
            })).sort((a, b) => a.name.localeCompare(b.name));
            return {
                courseCode, label: courseCode, sections: records.length,
                credits: sum(records.map(record => record.credits)), faculty
            };
        });
    }

    function workload(integratedYears, configured, year, quarter) {
        const selectedCodes = new Set(configured.map(course => course.code));
        const rows = [];
        const coverage = [];
        function add(record, academicYear, name, meta) {
            if (!isObject(record)) return;
            const courseCode = code(record.courseCode || record.code);
            const season = quarterName(record.quarter);
            if (!selectedCodes.has(courseCode) || (quarter !== 'annual' && season !== quarter)) return;
            const credits = numeric(record.credits);
            const multiplier = numeric(record.multiplier);
            const explicit = numeric(record.workloadCredits);
            rows.push({
                year: academicYear, courseCode, quarter: season, faculty: name,
                credits,
                workloadCredits: explicit !== null ? explicit
                    : credits !== null && multiplier !== null ? round(credits * multiplier) : null,
                source: name === null ? 'unassigned-schedule' : String(record.source || (meta.hasLiveSchedule ? 'program-command-schedule' : 'historical'))
            });
        }
        Object.entries(isObject(integratedYears) ? integratedYears : {}).sort(([a], [b]) => a.localeCompare(b))
            .forEach(([academicYear, yearData]) => {
                if (!/^\d{4}-\d{2}$/.test(academicYear) || !isObject(yearData) || (year !== 'all' && year !== academicYear)) return;
                const meta = isObject(yearData.meta) ? yearData.meta : {};
                const first = rows.length;
                facultyRecords(yearData).forEach((record, name) => {
                    (Array.isArray(record.courses) ? record.courses : []).forEach(course => add(course, academicYear, name, meta));
                });
                // Unassigned courses are absent from faculty totals. Never add their summary again.
                (Array.isArray(meta.unresolvedScheduleCourses?.courses) ? meta.unresolvedScheduleCourses.courses : [])
                    .forEach(course => add(course, academicYear, null, meta));
                const matching = rows.slice(first);
                coverage.push({
                    year: academicYear, recordCount: matching.length || null,
                    quarters: SEASONS.filter(season => matching.some(row => row.quarter === season)),
                    draft: meta.hasLiveSchedule === true
                });
            });
        const faculty = [...new Set(rows.map(row => row.faculty).filter(name => name !== null))].map(name => {
            const records = rows.filter(row => row.faculty === name);
            return { name, credits: sum(records.map(row => row.credits)), workload: sum(records.map(row => row.workloadCredits)), recordCount: records.length };
        }).sort((a, b) => a.name.localeCompare(b.name));
        const courses = configured.map(course => {
            const records = rows.filter(row => row.courseCode === course.code);
            return { ...course, credits: sum(records.map(row => row.credits)), workload: sum(records.map(row => row.workloadCredits)), recordCount: records.length || null };
        });
        const unassigned = rows.filter(row => row.faculty === null);
        return {
            total: sum(rows.map(row => row.workloadCredits)), credits: sum(rows.map(row => row.credits)),
            recordCount: rows.length || null, supervisorCount: rows.length ? faculty.length : null,
            unassignedWorkload: rows.length ? unassigned.length ? sum(unassigned.map(row => row.workloadCredits)) : 0 : null,
            rows, faculty, courses, coverage,
            missingMetricCount: rows.filter(row => row.credits === null || row.workloadCredits === null).length
        };
    }

    function build(data = {}, options = {}) {
        const year = options.year || 'all';
        const quarter = quarterName(options.quarter) || 'annual';
        const course = !options.course || options.course === 'all' ? 'all' : code(options.course);
        const configured = configuredCourses(data.courses, course);
        const workloadModel = workload(data.integratedYears, configured, year, quarter);
        return {
            selection: { year, quarter, course },
            registrations: registrations(data.enrollment, configured, year, quarter),
            workload: workloadModel,
            byCourseFaculty: byCourseFaculty(workloadModel.rows)
        };
    }

    return { build };
})();

if (typeof window !== 'undefined') window.AppliedLearningViewModel = AppliedLearningViewModel;
if (typeof module !== 'undefined' && module.exports) module.exports = AppliedLearningViewModel;
