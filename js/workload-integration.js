/**
 * Workload Integration Utilities
 * Unifies AY setup, Program Command schedule, and faculty workload detail entries.
 */

const WorkloadIntegration = (function() {
    'use strict';

    const AY_SETUP_STORAGE_KEY = 'programCommandAySetup';
    const SCHEDULE_STORAGE_PREFIX = 'designSchedulerData_';
    const DETAIL_STORAGE_KEY = 'programCommandFacultyWorkloadDetails';
    const CLSS_WORKLOAD_IMPORT_STORAGE_KEY = 'programCommandClssWorkloadImport';

    const APPLIED_LEARNING_COURSES = {
        'DESN 399': { title: 'Independent Study', rate: 0.2 },
        'DESN 491': { title: 'Senior Project', rate: 0.2 },
        'DESN 495': { title: 'Internship', rate: 0.1 },
        'DESN 499': { title: 'Independent Study', rate: 0.2 }
    };

    const ROLE_TARGET_DEFAULTS = {
        'Tenure/Tenure-track': 36,
        'Full Professor': 36,
        'Associate Professor': 36,
        'Assistant Professor': 36,
        'Senior Lecturer': 45,
        Lecturer: 45
    };

    // Chair-provided preliminary planning defaults used when AY Setup is missing.
    // These are name/alias matched and only applied as fallbacks.
    const PRELIMINARY_ROSTER_TARGET_RULES = [
        {
            id: 'travis-tenure',
            aliases: ['travis', 'travis masingale', 'tmasingale', 'masingale', 't masingale'],
            role: 'Full Professor',
            annualTargetCredits: 36,
            releaseCredits: 0
        },
        {
            id: 'colin-tenure',
            aliases: ['colin', 'colin manikoth', 'cmanikoth', 'manikoth', 'c manikoth'],
            role: 'Associate Professor',
            annualTargetCredits: 36,
            releaseCredits: 0
        },
        {
            id: 'ginelle-tenure',
            aliases: ['ginelle', 'ginelle hustrulid', 'ghustrulid', 'hustrulid', 'g hustrulid'],
            role: 'Full Professor',
            annualTargetCredits: 36,
            releaseCredits: 0
        },
        {
            id: 'mindy-chair',
            aliases: ['mindy', 'mindy breen', 'mbreen', 'breen', 'm breen', 'melinda', 'melinda breen'],
            role: 'Full Professor',
            annualTargetCredits: 36,
            releaseCredits: 18,
            specialRole: 'Chair'
        },
        {
            id: 'simeon-sam-lecturer',
            aliases: ['simeon', 'sam', 'simeon mills', 'sam mills', 'smills', 'mills', 's mills'],
            role: 'Senior Lecturer',
            annualTargetCredits: 45,
            releaseCredits: 0
        },
        {
            id: 'sonja-lecturer',
            aliases: ['sonja', 'sonja durr', 'sdurr', 'durr', 's durr'],
            role: 'Senior Lecturer',
            annualTargetCredits: 45,
            releaseCredits: 0
        },
        {
            id: 'ariel-lecturer',
            aliases: ['ariel', 'ariel sopu', 'asopu', 'sopu', 'a sopu'],
            role: 'Lecturer',
            annualTargetCredits: 45,
            releaseCredits: 0
        },
        {
            id: 'meg-lecturer',
            aliases: ['meg', 'meg lybbert', 'meg lybert', 'mlybbert', 'lybbert', 'm lybbert', 'mlybert', 'lybert', 'm lybert'],
            role: 'Senior Lecturer',
            annualTargetCredits: 45,
            releaseCredits: 0
        }
    ];

    const QUARTER_KEY_TO_NAME = {
        fall: 'Fall',
        winter: 'Winter',
        spring: 'Spring',
        summer: 'Summer'
    };

    const QUARTER_NAME_TO_KEY = {
        Fall: 'fall',
        Winter: 'winter',
        Spring: 'spring',
        Summer: 'summer'
    };

    function parseStorageJSON(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return fallback;
            return JSON.parse(raw);
        } catch (error) {
            console.warn(`Could not parse localStorage key "${key}":`, error);
            return fallback;
        }
    }

    function writeStorageJSON(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function clone(value) {
        return value ? JSON.parse(JSON.stringify(value)) : value;
    }

    function normalizeNameKey(name) {
        return String(name || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
    }

    function normalizeCourseCode(courseCode) {
        return String(courseCode || '')
            .toUpperCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeQuarterName(quarter) {
        const text = String(quarter || '').trim();
        if (!text) return 'Fall';
        if (QUARTER_KEY_TO_NAME[text.toLowerCase()]) return QUARTER_KEY_TO_NAME[text.toLowerCase()];
        return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    }

    function createQuarterSummary() {
        return {
            Fall: { credits: 0, workload: 0, sections: 0, scheduledCredits: 0, appliedLearningCredits: 0 },
            Winter: { credits: 0, workload: 0, sections: 0, scheduledCredits: 0, appliedLearningCredits: 0 },
            Spring: { credits: 0, workload: 0, sections: 0, scheduledCredits: 0, appliedLearningCredits: 0 },
            Summer: { credits: 0, workload: 0, sections: 0, scheduledCredits: 0, appliedLearningCredits: 0 }
        };
    }

    function findPreliminaryRosterTargetRule(name) {
        const normalized = normalizeNameKey(name);
        if (!normalized) return null;

        return PRELIMINARY_ROSTER_TARGET_RULES.find((rule) => {
            return (rule.aliases || []).some((alias) => {
                const aliasKey = normalizeNameKey(alias);
                if (!aliasKey) return false;
                return normalized === aliasKey || normalized.includes(aliasKey) || aliasKey.includes(normalized);
            });
        }) || null;
    }

    function summarizeUnassignedScheduleCourses(courses) {
        const items = Array.isArray(courses) ? courses : [];
        const byQuarter = createQuarterSummary();

        items.forEach((course) => {
            const quarter = normalizeQuarterName(course.quarter);
            const bucket = byQuarter[quarter] || byQuarter.Fall;
            const credits = Number(course.credits) || 0;
            const workload = Number(course.workloadCredits) || Number((credits * getAppliedLearningRate(course.courseCode)).toFixed(3));
            const isAppliedLearning = getAppliedLearningRate(course.courseCode) < 1;

            bucket.credits = Number((bucket.credits + credits).toFixed(3));
            bucket.workload = Number((bucket.workload + workload).toFixed(3));
            bucket.sections += 1;
            if (isAppliedLearning) {
                bucket.appliedLearningCredits = Number((bucket.appliedLearningCredits + credits).toFixed(3));
            } else {
                bucket.scheduledCredits = Number((bucket.scheduledCredits + credits).toFixed(3));
            }
        });

        const totalCredits = items.reduce((sum, course) => sum + (Number(course.credits) || 0), 0);
        const totalWorkload = items.reduce((sum, course) => {
            const credits = Number(course.credits) || 0;
            const multiplier = Number(course.multiplier) || getAppliedLearningRate(course.courseCode);
            return sum + (Number(course.workloadCredits) || Number((credits * multiplier).toFixed(3)));
        }, 0);

        return {
            count: items.length,
            totalCredits: Number(totalCredits.toFixed(3)),
            totalWorkloadCredits: Number(totalWorkload.toFixed(3)),
            byQuarter,
            courses: items.map((course) => ({
                courseCode: normalizeCourseCode(course.courseCode || course.code),
                quarter: normalizeQuarterName(course.quarter),
                credits: Number(course.credits) || 0,
                workloadCredits: Number(course.workloadCredits) || Number(((Number(course.credits) || 0) * getAppliedLearningRate(course.courseCode)).toFixed(3)),
                instructor: String(course.assignedFaculty || course.instructor || 'TBD').trim() || 'TBD'
            }))
        };
    }

    function parseNameParts(name) {
        const parts = String(name || '')
            .replace(/[^a-zA-Z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(Boolean);
        if (!parts.length) return { first: '', last: '' };
        return {
            first: parts[0].toLowerCase(),
            last: parts[parts.length - 1].toLowerCase()
        };
    }

    function isPlaceholderFaculty(name) {
        const value = String(name || '').trim().toLowerCase();
        return !value || value === 'tbd' || value === 'staff' || value === 'staff/other';
    }

    function getAppliedLearningRate(courseCode) {
        const code = normalizeCourseCode(courseCode);
        return APPLIED_LEARNING_COURSES[code]?.rate || 1;
    }

    function getAppliedLearningCourses() {
        return Object.entries(APPLIED_LEARNING_COURSES).map(([code, details]) => ({
            code,
            title: details.title,
            rate: details.rate
        }));
    }

    function readAySetupStore() {
        return parseStorageJSON(AY_SETUP_STORAGE_KEY, {});
    }

    function readAySetupDataForYear(year) {
        const store = readAySetupStore();
        return store?.[year] || null;
    }

    function getScheduleStorageKey(year) {
        return `${SCHEDULE_STORAGE_PREFIX}${year}`;
    }

    function readProgramCommandSchedule(year) {
        if (!year) return null;
        return parseStorageJSON(getScheduleStorageKey(year), null);
    }

    function readClssWorkloadImportPayload() {
        return parseStorageJSON(CLSS_WORKLOAD_IMPORT_STORAGE_KEY, null);
    }

    function getClssWorkloadImportCourses(year) {
        const payload = readClssWorkloadImportPayload();
        if (!payload || payload.source !== 'clss-import' || payload.mode !== 'workloads' || payload.active !== true) {
            return { courses: [], overrideScheduler: false };
        }

        const targetYear = String(payload.targetYear || '').trim();
        if (!targetYear || targetYear !== String(year || '').trim()) {
            return { courses: [], overrideScheduler: false };
        }

        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        const courses = rows
            .map((row, index) => {
                const courseCode = normalizeCourseCode(row.courseCode || row.code);
                if (!courseCode) return null;

                const quarter = normalizeQuarterName(row.quarter);
                return {
                    id: String(row.id || `clss-workload-${targetYear}-${index}`),
                    courseCode,
                    title: String(row.title || row.name || '').trim(),
                    credits: Number(row.credits) || 5,
                    assignedFaculty: String(row.assignedFaculty || row.instructor || 'TBD').trim() || 'TBD',
                    instructor: String(row.assignedFaculty || row.instructor || 'TBD').trim() || 'TBD',
                    room: String(row.room || (row.modality === 'online' ? 'ONLINE' : (row.modality === 'arranged' ? 'ARRANGED' : ''))).trim(),
                    day: String(row.day || '').trim(),
                    time: String(row.time || '').trim(),
                    quarter
                };
            })
            .filter(Boolean);

        return {
            courses,
            overrideScheduler: payload.overrideScheduler === true
        };
    }

    function getProgramCommandScheduleCourses(year) {
        const schedule = readProgramCommandSchedule(year);

        const courses = [];
        if (schedule && typeof schedule === 'object') {
            ['fall', 'winter', 'spring'].forEach((quarterKey) => {
                const quarterData = schedule[quarterKey];
                if (!quarterData || typeof quarterData !== 'object') return;

                Object.entries(quarterData).forEach(([day, dayData]) => {
                    if (!dayData || typeof dayData !== 'object') return;

                    Object.entries(dayData).forEach(([time, list]) => {
                        if (!Array.isArray(list)) return;
                        list.forEach((course, index) => {
                            courses.push({
                                id: `${year}-${quarterKey}-${day}-${time}-${index}`,
                                courseCode: normalizeCourseCode(course?.code),
                                title: String(course?.name || course?.title || '').trim(),
                                credits: Number(course?.credits) || 5,
                                assignedFaculty: String(course?.instructor || 'TBD').trim(),
                                instructor: String(course?.instructor || 'TBD').trim(),
                                room: String(course?.room || '').trim(),
                                day: String(day || '').trim(),
                                time: String(time || '').trim(),
                                quarter: QUARTER_KEY_TO_NAME[quarterKey]
                            });
                        });
                    });
                });
            });
        }

        const clssImport = getClssWorkloadImportCourses(year);
        if (clssImport.overrideScheduler && clssImport.courses.length > 0) {
            return clssImport.courses;
        }
        if (clssImport.courses.length > 0) {
            return [...courses, ...clssImport.courses];
        }

        return courses;
    }

    function getDefaultDetailStore() {
        return {
            version: 1,
            byYear: {}
        };
    }

    function readDetailStore() {
        const parsed = parseStorageJSON(DETAIL_STORAGE_KEY, null);
        if (!parsed || typeof parsed !== 'object') return getDefaultDetailStore();
        if (!parsed.byYear || typeof parsed.byYear !== 'object') parsed.byYear = {};
        return parsed;
    }

    function writeDetailStore(store) {
        const value = store && typeof store === 'object' ? store : getDefaultDetailStore();
        writeStorageJSON(DETAIL_STORAGE_KEY, value);
    }

    function getDetailEntriesForYear(year) {
        const store = readDetailStore();
        const yearData = store.byYear?.[year];
        const faculty = yearData?.faculty;
        return faculty && typeof faculty === 'object' ? faculty : {};
    }

    function listFacultyNamesFromDetailEntries(year) {
        const yearEntries = getDetailEntriesForYear(year);
        return Object.values(yearEntries)
            .map((record) => String(record?.displayName || '').trim())
            .filter(Boolean);
    }

    function getFacultyWorkloadDetailEntries(year, facultyName) {
        const key = normalizeNameKey(facultyName);
        if (!key) return [];

        const yearEntries = getDetailEntriesForYear(year);
        const record = yearEntries[key];
        return Array.isArray(record?.entries) ? clone(record.entries) : [];
    }

    function saveFacultyWorkloadDetailEntries(year, facultyName, entries, displayName = null) {
        const key = normalizeNameKey(facultyName);
        if (!year || !key) return false;

        const sanitizedEntries = (Array.isArray(entries) ? entries : [])
            .map((entry) => {
                const courseCode = normalizeCourseCode(entry.courseCode);
                const studentCredits = Number(entry.studentCredits);
                const workloadRate = Number(entry.workloadRate);
                const quarter = normalizeQuarterName(entry.quarter || 'Fall');
                if (!courseCode || !Number.isFinite(studentCredits) || studentCredits <= 0) return null;
                if (!Number.isFinite(workloadRate) || workloadRate <= 0) return null;
                return {
                    id: String(entry.id || `entry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
                    quarter,
                    courseCode,
                    studentCredits,
                    workloadRate,
                    workloadCredits: Number((studentCredits * workloadRate).toFixed(3)),
                    notes: String(entry.notes || '').trim(),
                    updatedAt: new Date().toISOString()
                };
            })
            .filter(Boolean);

        const store = readDetailStore();
        if (!store.byYear[year]) {
            store.byYear[year] = { faculty: {} };
        }
        if (!store.byYear[year].faculty || typeof store.byYear[year].faculty !== 'object') {
            store.byYear[year].faculty = {};
        }

        if (!sanitizedEntries.length) {
            delete store.byYear[year].faculty[key];
            if (Object.keys(store.byYear[year].faculty).length === 0) {
                delete store.byYear[year];
            }
        } else {
            store.byYear[year].faculty[key] = {
                displayName: String(displayName || facultyName || '').trim(),
                entries: sanitizedEntries,
                updatedAt: new Date().toISOString()
            };
        }

        writeDetailStore(store);
        return true;
    }

    function collectScheduleYearsFromLocalStorage() {
        const years = [];
        try {
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = localStorage.key(i);
                if (!key || !key.startsWith(SCHEDULE_STORAGE_PREFIX)) continue;
                const year = key.slice(SCHEDULE_STORAGE_PREFIX.length);
                if (/^\d{4}-\d{2}$/.test(year)) {
                    years.push(year);
                }
            }
        } catch (error) {
            console.warn('Could not inspect localStorage keys:', error);
        }
        return years;
    }

    function getAcademicYearOptions(workloadData) {
        const workloadYears = Array.isArray(workloadData?.workloadByYear?.years)
            ? workloadData.workloadByYear.years
            : [];
        const ayYears = Object.keys(readAySetupStore());
        const detailYears = Object.keys(readDetailStore().byYear || {});
        const scheduleYears = collectScheduleYearsFromLocalStorage();
        const clssImportPayload = readClssWorkloadImportPayload();
        const clssImportYear = (clssImportPayload && clssImportPayload.active === true && clssImportPayload.mode === 'workloads')
            ? String(clssImportPayload.targetYear || '').trim()
            : '';

        return [...new Set([...workloadYears, ...ayYears, ...detailYears, ...scheduleYears, clssImportYear])]
            .filter((year) => /^\d{4}-\d{2}$/.test(year))
            .sort();
    }

    function inferCategory(name, role, baseCategory = '') {
        const roleText = String(role || '').toLowerCase();
        const nameText = String(name || '').toLowerCase();
        const existing = String(baseCategory || '').toLowerCase();

        if (existing === 'former') return 'former';
        if (existing === 'adjunct') return 'adjunct';
        if (roleText.includes('adjunct') || nameText.includes('adjunct')) return 'adjunct';
        return 'fullTime';
    }

    function inferDefaultMaxWorkload(role, category, baseMaxWorkload = 0) {
        const existing = Number(baseMaxWorkload);
        if (Number.isFinite(existing) && existing > 0) return existing;

        if (category === 'adjunct') return 15;
        const roleText = String(role || '').toLowerCase();
        if (roleText.includes('tenure') || roleText.includes('professor')) return 36;
        return 45;
    }

    function createEmptyFacultyRecord(name) {
        return {
            facultyName: String(name || '').trim(),
            originalName: String(name || '').trim(),
            totalCredits: 0,
            totalWorkloadCredits: 0,
            scheduledCredits: 0,
            appliedLearningCredits: 0,
            appliedLearningWorkload: 0,
            totalStudents: 0,
            sections: 0,
            courses: [],
            appliedLearning: {
                'DESN 399': { credits: 0, workload: 0, students: 0, sections: 0 },
                'DESN 491': { credits: 0, workload: 0, students: 0, sections: 0 },
                'DESN 495': { credits: 0, workload: 0, students: 0, sections: 0 },
                'DESN 499': { credits: 0, workload: 0, students: 0, sections: 0 }
            },
            category: 'fullTime',
            status: 'underutilized',
            rank: 'Lecturer',
            maxWorkload: 45,
            currentWorkload: 0,
            utilizationRate: 0,
            availableCapacity: 45
        };
    }

    function applyBaseFacultyData(record, baseData) {
        if (!baseData || typeof baseData !== 'object') return;

        const fields = [
            'originalName',
            'rank',
            'category',
            'maxWorkload',
            'manualOverride',
            'manualOverrideNote'
        ];
        fields.forEach((field) => {
            if (baseData[field] !== undefined) {
                record[field] = clone(baseData[field]);
            }
        });

        if (Array.isArray(baseData.courses)) {
            record.courses = clone(baseData.courses);
        }
    }

    function buildNameResolver(knownNames) {
        const canonicalByKey = new Map();
        const byLastName = new Map();

        (knownNames || []).forEach((name) => {
            const cleaned = String(name || '').trim();
            if (!cleaned) return;

            const key = normalizeNameKey(cleaned);
            if (!canonicalByKey.has(key)) {
                canonicalByKey.set(key, cleaned);
            }

            const parts = parseNameParts(cleaned);
            if (!parts.last) return;
            if (!byLastName.has(parts.last)) byLastName.set(parts.last, []);
            byLastName.get(parts.last).push(cleaned);
        });

        return function resolveName(rawName) {
            const raw = String(rawName || '').trim();
            if (!raw) return raw;

            const direct = canonicalByKey.get(normalizeNameKey(raw));
            if (direct) return direct;

            const rawParts = parseNameParts(raw);
            if (!rawParts.last) return raw;

            const lastNameCandidates = byLastName.get(rawParts.last) || [];
            if (lastNameCandidates.length === 1) return lastNameCandidates[0];
            if (!lastNameCandidates.length) return raw;

            const initialCandidates = lastNameCandidates.filter((candidate) => {
                const candidateParts = parseNameParts(candidate);
                return candidateParts.first && rawParts.first
                    && candidateParts.first.charAt(0) === rawParts.first.charAt(0);
            });

            if (initialCandidates.length === 1) return initialCandidates[0];
            return lastNameCandidates[0];
        };
    }

    function recalcFacultyRecord(record) {
        const summary = {
            totalCredits: 0,
            totalWorkloadCredits: 0,
            scheduledCredits: 0,
            appliedLearningCredits: 0,
            appliedLearningWorkload: 0,
            totalStudents: 0,
            sections: 0,
            byQuarter: createQuarterSummary(),
            appliedLearning: {
                'DESN 399': { credits: 0, workload: 0, students: 0, sections: 0 },
                'DESN 491': { credits: 0, workload: 0, students: 0, sections: 0 },
                'DESN 495': { credits: 0, workload: 0, students: 0, sections: 0 },
                'DESN 499': { credits: 0, workload: 0, students: 0, sections: 0 }
            }
        };

        const normalizedCourses = (Array.isArray(record.courses) ? record.courses : []).map((course, index) => {
            const code = normalizeCourseCode(course.courseCode || course.code);
            const credits = Number(course.credits) || 0;
            const multiplier = Number(course.multiplier) || getAppliedLearningRate(code);
            const workloadCredits = Number.isFinite(Number(course.workloadCredits))
                ? Number(course.workloadCredits)
                : Number((credits * multiplier).toFixed(3));
            const quarter = normalizeQuarterName(course.quarter || 'Fall');
            const type = multiplier < 1 ? 'applied-learning' : 'scheduled';
            const students = Number(course.enrolled) || Number(course.students) || 0;

            const normalized = {
                id: String(course.id || `course_${index}_${Math.random().toString(36).slice(2, 8)}`),
                courseCode: code,
                section: String(course.section || '001'),
                credits,
                enrolled: students,
                multiplier,
                workloadCredits,
                type,
                quarter,
                notes: String(course.notes || '').trim(),
                source: course.source || 'integrated'
            };

            summary.totalCredits += credits;
            summary.totalWorkloadCredits += workloadCredits;
            summary.totalStudents += students;
            summary.sections += 1;

            const quarterBucket = summary.byQuarter[quarter] || summary.byQuarter.Fall;
            quarterBucket.credits = Number((quarterBucket.credits + credits).toFixed(3));
            quarterBucket.workload = Number((quarterBucket.workload + workloadCredits).toFixed(3));
            quarterBucket.sections += 1;

            if (type === 'applied-learning') {
                summary.appliedLearningCredits += credits;
                summary.appliedLearningWorkload += workloadCredits;
                quarterBucket.appliedLearningCredits = Number((quarterBucket.appliedLearningCredits + credits).toFixed(3));
                if (summary.appliedLearning[code]) {
                    summary.appliedLearning[code].credits += credits;
                    summary.appliedLearning[code].workload += workloadCredits;
                    summary.appliedLearning[code].students += students || credits;
                    summary.appliedLearning[code].sections += 1;
                }
            } else {
                summary.scheduledCredits += credits;
                quarterBucket.scheduledCredits = Number((quarterBucket.scheduledCredits + credits).toFixed(3));
            }

            return normalized;
        });

        record.courses = normalizedCourses;
        record.totalCredits = Number(summary.totalCredits.toFixed(3));
        record.totalWorkloadCredits = Number(summary.totalWorkloadCredits.toFixed(3));
        record.scheduledCredits = Number(summary.scheduledCredits.toFixed(3));
        record.appliedLearningCredits = Number(summary.appliedLearningCredits.toFixed(3));
        record.appliedLearningWorkload = Number(summary.appliedLearningWorkload.toFixed(3));
        record.totalStudents = summary.totalStudents;
        record.sections = summary.sections;
        record.byQuarter = summary.byQuarter;
        record.appliedLearning = summary.appliedLearning;

        record.currentWorkload = record.totalWorkloadCredits;
        const maxWorkload = Number(record.maxWorkload) || 0;
        record.maxWorkload = maxWorkload;
        record.utilizationRate = maxWorkload > 0
            ? Number(((record.totalWorkloadCredits / maxWorkload) * 100).toFixed(1))
            : 0;
        record.availableCapacity = Number(Math.max(0, maxWorkload - record.totalWorkloadCredits).toFixed(3));

        if (record.utilizationRate > 100) {
            record.status = 'overloaded';
        } else if (record.utilizationRate >= 60) {
            record.status = 'optimal';
        } else {
            record.status = 'underutilized';
        }
    }

    function buildIntegratedWorkloadYearData(workloadData, year) {
        let baseYearData = null;
        const yearDataGetter =
            (typeof getYearData === 'function' && getYearData)
            || (typeof globalThis !== 'undefined' && typeof globalThis.getYearData === 'function'
                ? globalThis.getYearData
                : null);

        if (yearDataGetter) {
            baseYearData = clone(yearDataGetter(workloadData, year));
        }

        if (year === 'all') {
            return baseYearData || { all: {}, fullTime: {}, adjunct: {}, former: {}, meta: { source: 'fallback' } };
        }

        if (!baseYearData) {
            baseYearData = { all: {}, fullTime: {}, adjunct: {}, former: {} };
        }

        const ayYearData = readAySetupDataForYear(year) || {};
        const ayFaculty = Array.isArray(ayYearData.faculty) ? ayYearData.faculty : [];
        const scheduleCourses = getProgramCommandScheduleCourses(year);
        const detailFacultyMap = getDetailEntriesForYear(year);

        const baseAll = baseYearData.all || {};
        const baseNames = Object.keys(baseAll);
        const ayNames = ayFaculty.map((record) => record.name).filter(Boolean);
        const detailNames = Object.values(detailFacultyMap).map((bucket) => bucket.displayName).filter(Boolean);
        const scheduleNames = scheduleCourses
            .map((course) => course.assignedFaculty || course.instructor)
            .filter((name) => !isPlaceholderFaculty(name));

        const knownNames = [...new Set([...baseNames, ...ayNames, ...detailNames, ...scheduleNames])];
        const resolveFacultyName = buildNameResolver(knownNames);

        const recordsByKey = new Map();

        function ensureRecord(name) {
            const resolvedName = resolveFacultyName(name || '');
            const fallbackName = String(name || '').trim();
            const chosenName = String(resolvedName || fallbackName || '').trim();
            if (!chosenName) return null;

            const key = normalizeNameKey(chosenName);
            if (!recordsByKey.has(key)) {
                const record = createEmptyFacultyRecord(chosenName);
                const baseNameMatch = baseNames.find((baseName) => normalizeNameKey(baseName) === key);
                if (baseNameMatch && baseAll[baseNameMatch]) {
                    applyBaseFacultyData(record, baseAll[baseNameMatch]);
                    record.facultyName = baseNameMatch;
                }
                recordsByKey.set(key, record);
            }
            return recordsByKey.get(key);
        }

        baseNames.forEach((name) => ensureRecord(name));
        ayNames.forEach((name) => ensureRecord(name));
        detailNames.forEach((name) => ensureRecord(name));
        scheduleNames.forEach((name) => ensureRecord(name));

        const hasLiveSchedule = scheduleCourses.length > 0;
        const unassignedScheduleCourses = [];
        if (hasLiveSchedule) {
            recordsByKey.forEach((record) => {
                record.courses = [];
            });

            scheduleCourses.forEach((course, index) => {
                if (isPlaceholderFaculty(course.assignedFaculty || course.instructor)) {
                    const code = normalizeCourseCode(course.courseCode || course.code);
                    const credits = Number(course.credits) || 5;
                    const multiplier = getAppliedLearningRate(code);
                    unassignedScheduleCourses.push({
                        id: course.id || `schedule_unassigned_${index}`,
                        courseCode: code,
                        quarter: normalizeQuarterName(course.quarter),
                        credits,
                        multiplier,
                        workloadCredits: Number((credits * multiplier).toFixed(3)),
                        instructor: String(course.assignedFaculty || course.instructor || 'TBD').trim() || 'TBD'
                    });
                    return;
                }
                const record = ensureRecord(course.assignedFaculty || course.instructor);
                if (!record) return;

                const code = normalizeCourseCode(course.courseCode || course.code);
                const credits = Number(course.credits) || 5;
                const multiplier = getAppliedLearningRate(code);
                record.courses.push({
                    id: course.id || `schedule_${index}`,
                    courseCode: code,
                    section: String(course.section || '001'),
                    credits,
                    enrolled: Number(course.enrolled) || 0,
                    multiplier,
                    workloadCredits: Number((credits * multiplier).toFixed(3)),
                    type: multiplier < 1 ? 'applied-learning' : 'scheduled',
                    quarter: normalizeQuarterName(course.quarter),
                    notes: '',
                    source: 'program-command-schedule'
                });
            });
        }

        Object.entries(detailFacultyMap).forEach(([key, facultyBucket]) => {
            const displayName = String(facultyBucket?.displayName || '').trim();
            const entries = Array.isArray(facultyBucket?.entries) ? facultyBucket.entries : [];
            if (!entries.length) return;

            const record = ensureRecord(displayName || key);
            if (!record) return;

            entries.forEach((entry, index) => {
                const code = normalizeCourseCode(entry.courseCode);
                if (!APPLIED_LEARNING_COURSES[code]) return;

                const studentCredits = Number(entry.studentCredits);
                if (!Number.isFinite(studentCredits) || studentCredits <= 0) return;

                const workloadRate = Number(entry.workloadRate);
                const multiplier = Number.isFinite(workloadRate) && workloadRate > 0
                    ? workloadRate
                    : getAppliedLearningRate(code);

                record.courses.push({
                    id: entry.id || `detail_${index}`,
                    courseCode: code,
                    section: 'DLT',
                    credits: studentCredits,
                    enrolled: Number(entry.students) || 0,
                    multiplier,
                    workloadCredits: Number((studentCredits * multiplier).toFixed(3)),
                    type: 'applied-learning',
                    quarter: normalizeQuarterName(entry.quarter),
                    notes: String(entry.notes || '').trim(),
                    source: 'faculty-detail-entry'
                });
            });
        });

        const ayByKey = new Map();
        ayFaculty.forEach((record) => {
            const resolved = resolveFacultyName(record.name || '');
            const key = normalizeNameKey(resolved || record.name);
            if (key) ayByKey.set(key, record);
        });

        const fallbackRulesApplied = [];
        const fallbackRuleIdsApplied = new Set();
        const adjunctAssignedDefaultsApplied = [];

        recordsByKey.forEach((record, key) => {
            const ayRecord = ayByKey.get(key);
            const category = inferCategory(record.facultyName, ayRecord?.role || record.rank, record.category);
            record.category = category;

            if (ayRecord) {
                const role = String(ayRecord.role || record.rank || '').trim();
                const targetFromRole = ROLE_TARGET_DEFAULTS[role] || null;
                const annualTargetCredits = Number(ayRecord.annualTargetCredits);
                const target = Number.isFinite(annualTargetCredits) && annualTargetCredits > 0
                    ? annualTargetCredits
                    : targetFromRole || inferDefaultMaxWorkload(role, category, record.maxWorkload);
                const releaseCredits = Number(ayRecord.releaseCredits) || 0;
                const netTarget = Math.max(0, target - releaseCredits);

                record.rank = role || record.rank;
                record.ayRole = role || '';
                record.ayTargetCredits = Number(target.toFixed(2));
                record.ayReleaseCredits = Number(releaseCredits.toFixed(2));
                record.ayNetTargetCredits = Number(netTarget.toFixed(2));
                record.ayReleasePercent = Number.isFinite(Number(ayRecord.releasePercent))
                    ? Number(ayRecord.releasePercent)
                    : (target > 0 ? Number(((releaseCredits / target) * 100).toFixed(1)) : 0);
                record.ayReleaseReason = String(ayRecord.releaseReason || '').trim();
                record.ayNotes = String(ayRecord.notes || '').trim();
                record.ayActive = ayRecord.active !== false;
                const ayChairFlag = ayRecord.isChair === true || /chair/i.test(record.ayReleaseReason);
                if (ayChairFlag) {
                    record.specialRole = 'Chair';
                } else if (record.specialRole === 'Chair') {
                    delete record.specialRole;
                }
                record.maxWorkload = netTarget > 0 ? netTarget : target;
            } else {
                const fallbackRule = findPreliminaryRosterTargetRule(record.facultyName);
                if (fallbackRule) {
                    const target = Number(fallbackRule.annualTargetCredits) || inferDefaultMaxWorkload(fallbackRule.role, category, record.maxWorkload);
                    const releaseCredits = Number(fallbackRule.releaseCredits) || 0;
                    const netTarget = Math.max(0, target - releaseCredits);

                    record.rank = fallbackRule.role || record.rank;
                    record.ayRole = fallbackRule.role || '';
                    record.ayTargetCredits = Number(target.toFixed(2));
                    record.ayReleaseCredits = Number(releaseCredits.toFixed(2));
                    record.ayNetTargetCredits = Number(netTarget.toFixed(2));
                    record.ayReleasePercent = target > 0
                        ? Number(((releaseCredits / target) * 100).toFixed(1))
                        : 0;
                    if (fallbackRule.specialRole) {
                        record.specialRole = fallbackRule.specialRole;
                    }
                    record.maxWorkload = netTarget > 0 ? netTarget : target;

                    if (!fallbackRuleIdsApplied.has(fallbackRule.id)) {
                        fallbackRuleIdsApplied.add(fallbackRule.id);
                        fallbackRulesApplied.push({
                            id: fallbackRule.id,
                            role: fallbackRule.role,
                            annualTargetCredits: Number(target.toFixed(2)),
                            releaseCredits: Number(releaseCredits.toFixed(2)),
                            netTargetCredits: Number(netTarget.toFixed(2)),
                            specialRole: fallbackRule.specialRole || '',
                            matchedFaculty: [record.facultyName]
                        });
                    } else {
                        const entry = fallbackRulesApplied.find((rule) => rule.id === fallbackRule.id);
                        if (entry && !entry.matchedFaculty.includes(record.facultyName)) {
                            entry.matchedFaculty.push(record.facultyName);
                        }
                    }
                } else {
                    const isFormer = String(record.category || '').toLowerCase() === 'former';
                    const hasAssignedWorkload = Number(record.totalWorkloadCredits) > 0
                        || (Array.isArray(record.courses) && record.courses.length > 0);

                    if (!isFormer && hasAssignedWorkload) {
                        const assignedTarget = Number((Array.isArray(record.courses)
                            ? record.courses.reduce((sum, course) => {
                                const workload = Number(course?.workloadCredits);
                                const credits = Number(course?.credits);
                                return sum + (Number.isFinite(workload) ? workload : (Number.isFinite(credits) ? credits : 0));
                            }, 0)
                            : Number(record.totalWorkloadCredits) || 0).toFixed(2));

                        record.category = 'adjunct';
                        record.rank = 'Adjunct';
                        record.ayRole = 'Adjunct';
                        record.ayTargetCredits = assignedTarget;
                        record.ayReleaseCredits = 0;
                        record.ayNetTargetCredits = assignedTarget;
                        record.ayReleasePercent = 0;
                        record.ayReleaseReason = '';
                        record.ayNotes = String(record.ayNotes || '').trim();
                        record.ayActive = true;
                        record.maxWorkload = assignedTarget;

                        adjunctAssignedDefaultsApplied.push({
                            facultyName: record.facultyName,
                            assignedTargetCredits: assignedTarget
                        });
                    } else {
                        record.maxWorkload = inferDefaultMaxWorkload(record.rank, category, record.maxWorkload);
                    }
                }
            }

            recalcFacultyRecord(record);
        });

        const all = {};
        const fullTime = {};
        const adjunct = {};
        const former = {};

        recordsByKey.forEach((record) => {
            const name = record.facultyName;
            all[name] = record;
            if (record.category === 'former') {
                former[name] = record;
            } else if (record.category === 'adjunct') {
                adjunct[name] = record;
            } else {
                fullTime[name] = record;
            }
        });

        const unresolvedSummary = summarizeUnassignedScheduleCourses(unassignedScheduleCourses);
        const preliminaryAssumptions = [
            'Teaching workload is derived from the Program Command scheduler draft for the selected academic year.',
            'DESN 399/491/499 use 0.2 workload rate and DESN 495 uses 0.1 workload rate.',
            'TBD/Staff/blank instructor assignments are excluded from faculty totals and listed as unresolved sections.',
            'Non-teaching workload (service/research/PTOL/other assigned time) is not derived from the schedule and should be reviewed manually unless AY setup release credits are entered.'
        ];

        if (fallbackRulesApplied.length > 0) {
            preliminaryAssumptions.push('Fallback chair planning targets were applied for matched faculty (tenure/tenure-track 36, lecturers 45, Mindy chair teaching target 18 via 18-credit release).');
        }
        if (adjunctAssignedDefaultsApplied.length > 0) {
            preliminaryAssumptions.push('Unlisted instructors are treated as adjuncts by default; adjunct target credits default to their currently assigned AY workload unless edited in AY Setup / workload planning.');
        }

        return {
            all,
            fullTime,
            adjunct,
            former,
            meta: {
                source: 'integrated',
                year,
                scheduleCourses: scheduleCourses.length,
                assignedScheduleCourses: Math.max(0, scheduleCourses.length - unresolvedSummary.count),
                unresolvedScheduleCourses: unresolvedSummary,
                ayFaculty: ayFaculty.length,
                detailFaculty: Object.keys(detailFacultyMap).length,
                hasLiveSchedule,
                preliminaryAssumptions,
                fallbackTargetRulesApplied: fallbackRulesApplied,
                adjunctAssignedDefaultsApplied
            }
        };
    }

    return {
        APPLIED_LEARNING_COURSES,
        QUARTER_KEY_TO_NAME,
        QUARTER_NAME_TO_KEY,
        normalizeNameKey,
        normalizeCourseCode,
        normalizeQuarterName,
        getAppliedLearningRate,
        getAppliedLearningCourses,
        readAySetupDataForYear,
        readProgramCommandSchedule,
        getProgramCommandScheduleCourses,
        getDetailEntriesForYear,
        getFacultyWorkloadDetailEntries,
        saveFacultyWorkloadDetailEntries,
        listFacultyNamesFromDetailEntries,
        getAcademicYearOptions,
        buildIntegratedWorkloadYearData
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorkloadIntegration;
}
