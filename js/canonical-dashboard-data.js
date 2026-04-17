(function canonicalDashboardDataModule(global) {
    'use strict';

    const DEFAULT_APPLIED_LEARNING_COURSES = {
        'DESN 399': { title: 'Independent Study', rate: 0.2 },
        'DESN 491': { title: 'Senior Project', rate: 0.2 },
        'DESN 495': { title: 'Internship', rate: 0.1 },
        'DESN 499': { title: 'Independent Study', rate: 0.2 }
    };

    const DEFAULT_WORKLOAD_LIMITS = {
        fulltime: 36,
        fullTime: 36,
        adjunct: 15,
        lecturer: 45
    };

    function normalizeCourseCode(courseCode) {
        return String(courseCode || '')
            .toUpperCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeQuarterName(value) {
        const text = String(value || '').trim();
        if (!text) return '';
        const lower = text.toLowerCase();
        if (lower === 'fall') return 'Fall';
        if (lower === 'winter') return 'Winter';
        if (lower === 'spring') return 'Spring';
        if (lower === 'summer') return 'Summer';
        return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    }

    function toRoundedNumber(value, digits = 1) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return 0;
        return Number(numeric.toFixed(digits));
    }

    function buildAppliedLearningMap(profile) {
        const rawMap = profile?.workload?.appliedLearningCourses;
        if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) {
            return { ...DEFAULT_APPLIED_LEARNING_COURSES };
        }

        const result = {};
        Object.entries(rawMap).forEach(([courseCode, details]) => {
            const code = normalizeCourseCode(courseCode);
            if (!code) return;

            if (Number.isFinite(Number(details))) {
                const rate = Number(details);
                if (rate > 0) {
                    result[code] = { title: code, rate };
                }
                return;
            }

            if (!details || typeof details !== 'object' || Array.isArray(details)) {
                return;
            }

            const rate = Number(details.rate);
            if (!Number.isFinite(rate) || rate <= 0) return;

            result[code] = {
                title: String(details.title || code).trim() || code,
                rate
            };
        });

        return Object.keys(result).length > 0
            ? result
            : { ...DEFAULT_APPLIED_LEARNING_COURSES };
    }

    function getFacultyWorkloadLimit(faculty, profile) {
        const explicit = Number(faculty?.max_workload ?? faculty?.maxWorkload);
        if (Number.isFinite(explicit) && explicit > 0) {
            return explicit;
        }

        const category = String(faculty?.category || '').trim();
        if (category && Number.isFinite(DEFAULT_WORKLOAD_LIMITS[category])) {
            return DEFAULT_WORKLOAD_LIMITS[category];
        }

        const targets = profile?.workload?.defaultAnnualTargets;
        if (targets && typeof targets === 'object' && !Array.isArray(targets)) {
            const targetValues = Object.values(targets).map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
            if (targetValues.length > 0) {
                return targetValues[0];
            }
        }

        return 36;
    }

    function deriveTrend(values) {
        const clean = (Array.isArray(values) ? values : []).filter((value) => Number.isFinite(value));
        if (clean.length < 2) return 'stable';

        const first = clean[0];
        const last = clean[clean.length - 1];
        if (last - first >= 3) return 'growing';
        if (first - last >= 3) return 'declining';
        return 'stable';
    }

    function buildCanonicalDashboardData({ scheduleRows = [], courses = [], faculty = [], profile = null, academicYear = null } = {}) {
        const courseMap = new Map();
        const facultyMap = new Map();
        const appliedLearningMap = buildAppliedLearningMap(profile);

        (Array.isArray(courses) ? courses : []).forEach((course) => {
            const code = normalizeCourseCode(course?.code);
            if (code) {
                courseMap.set(code, course);
            }
        });

        (Array.isArray(faculty) ? faculty : []).forEach((entry) => {
            if (entry?.id) {
                facultyMap.set(String(entry.id), entry);
            }
        });

        const courseStats = {};
        const facultyWorkload = {};
        const appliedLearningByQuarter = {};
        let totalScheduledStudents = 0;
        let missingProjectedEnrollmentCount = 0;

        (Array.isArray(scheduleRows) ? scheduleRows : []).forEach((row) => {
            const courseCode = normalizeCourseCode(
                row?.course?.code
                || row?.course_code
                || row?.code
            );
            if (!courseCode) return;

            const resolvedCourse = row?.course || courseMap.get(courseCode) || {};
            const projectedEnrollment = Number(row?.projected_enrollment ?? row?.projectedEnrollment);
            const hasProjectedEnrollment = Number.isFinite(projectedEnrollment);
            const credits = Number(
                resolvedCourse?.default_credits
                ?? resolvedCourse?.defaultCredits
                ?? resolvedCourse?.credits
            ) || 5;
            const quarter = normalizeQuarterName(row?.quarter);
            const peakCandidate = hasProjectedEnrollment ? projectedEnrollment : 0;
            const scheduleKey = `${courseCode}-${quarter}-${String(row?.section || '001').trim() || '001'}`;

            if (!courseStats[courseCode]) {
                courseStats[courseCode] = {
                    code: courseCode,
                    title: String(resolvedCourse?.title || courseCode).trim() || courseCode,
                    sections: 0,
                    peak: 0,
                    average: 0,
                    trend: 'stable',
                    isNew: false,
                    quarters: [],
                    scheduledSections: [],
                    _enrollmentValues: []
                };
            }

            const courseEntry = courseStats[courseCode];
            courseEntry.sections += 1;
            courseEntry.peak = Math.max(courseEntry.peak, peakCandidate);
            courseEntry.scheduledSections.push(scheduleKey);
            if (quarter && !courseEntry.quarters.includes(quarter)) {
                courseEntry.quarters.push(quarter);
            }
            if (hasProjectedEnrollment) {
                courseEntry._enrollmentValues.push(projectedEnrollment);
                totalScheduledStudents += projectedEnrollment;
            } else {
                missingProjectedEnrollmentCount += 1;
            }

            const facultyId = row?.faculty_id ? String(row.faculty_id) : null;
            const facultyEntry = (facultyId && facultyMap.get(facultyId)) || row?.faculty || null;
            const facultyName = String(facultyEntry?.name || '').trim();
            if (facultyName) {
                if (!facultyWorkload[facultyName]) {
                    facultyWorkload[facultyName] = {
                        status: 'optimal',
                        totalCredits: 0,
                        totalWorkloadCredits: 0,
                        maxWorkload: getFacultyWorkloadLimit(facultyEntry, profile),
                        totalStudents: 0,
                        sections: 0,
                        utilizationRate: 0,
                        appliedLearningCredits: 0,
                        projectedSections: []
                    };
                }

                const workloadRate = appliedLearningMap[courseCode]?.rate || 1;
                const workloadCredits = credits * workloadRate;
                const facultyWorkloadEntry = facultyWorkload[facultyName];
                facultyWorkloadEntry.totalCredits = toRoundedNumber(facultyWorkloadEntry.totalCredits + credits);
                facultyWorkloadEntry.totalWorkloadCredits = toRoundedNumber(facultyWorkloadEntry.totalWorkloadCredits + workloadCredits);
                facultyWorkloadEntry.sections += 1;
                facultyWorkloadEntry.projectedSections.push(scheduleKey);

                if (hasProjectedEnrollment) {
                    facultyWorkloadEntry.totalStudents += projectedEnrollment;
                }

                if (workloadRate < 1) {
                    facultyWorkloadEntry.appliedLearningCredits = toRoundedNumber(facultyWorkloadEntry.appliedLearningCredits + credits);
                    if (!appliedLearningByQuarter[quarter || 'Unassigned']) {
                        appliedLearningByQuarter[quarter || 'Unassigned'] = 0;
                    }
                    appliedLearningByQuarter[quarter || 'Unassigned'] = toRoundedNumber(
                        appliedLearningByQuarter[quarter || 'Unassigned'] + workloadCredits
                    );
                }
            }
        });

        Object.values(courseStats).forEach((entry) => {
            const enrollments = entry._enrollmentValues.slice();
            entry.average = enrollments.length
                ? toRoundedNumber(enrollments.reduce((sum, value) => sum + value, 0) / enrollments.length)
                : 0;
            entry.trend = deriveTrend(enrollments);
            delete entry._enrollmentValues;
        });

        Object.values(facultyWorkload).forEach((entry) => {
            const maxWorkload = Number(entry.maxWorkload) || 36;
            const utilization = maxWorkload > 0
                ? (entry.totalWorkloadCredits / maxWorkload) * 100
                : 0;
            entry.utilizationRate = toRoundedNumber(utilization);

            if (entry.totalWorkloadCredits > maxWorkload) {
                entry.status = 'overloaded';
            } else if (utilization < 60) {
                entry.status = 'underloaded';
            } else {
                entry.status = 'optimal';
            }
        });

        const appliedLearningWorkload = Object.values(appliedLearningByQuarter).reduce((sum, value) => sum + value, 0);

        return {
            workloadData: {
                facultyWorkload,
                appliedLearningTrends: {
                    trends: appliedLearningByQuarter,
                    summary: {
                        trend: 'stable',
                        change: 0,
                        percentChange: '0%',
                        latestWorkload: toRoundedNumber(appliedLearningWorkload),
                        latestYear: academicYear || null
                    }
                },
                metadata: {
                    academicYear: academicYear || null,
                    source: 'canonical-db',
                    totalScheduledStudents,
                    missingProjectedEnrollmentCount
                }
            },
            enrollmentData: {
                courseStats,
                metadata: {
                    academicYear: academicYear || null,
                    source: 'canonical-db',
                    totalScheduledStudents,
                    missingProjectedEnrollmentCount
                }
            },
            metadata: {
                academicYear: academicYear || null,
                totalScheduledStudents,
                missingProjectedEnrollmentCount,
                totalScheduledSections: (Array.isArray(scheduleRows) ? scheduleRows : []).length
            }
        };
    }

    const api = {
        normalizeCourseCode,
        normalizeQuarterName,
        buildAppliedLearningMap,
        buildCanonicalDashboardData
    };

    global.CanonicalDashboardData = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
