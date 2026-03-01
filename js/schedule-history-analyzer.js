/**
 * ScheduleHistoryAnalyzer (CE-04)
 * Learns scheduling patterns from historical enrollment/schedule data.
 */
const ScheduleHistoryAnalyzer = (function() {
    'use strict';

    const MIN_PATTERN_SAMPLES = 2;
    const HIGH_FILL_THRESHOLD = 0.85;
    const LOW_FILL_THRESHOLD = 0.55;
    const HIGH_WAITLIST_THRESHOLD = 3;

    let lastAnalysis = null;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function toNumber(value) {
        const num = Number(value);
        return Number.isFinite(num) ? num : 0;
    }

    function normalizeQuarter(value) {
        const raw = String(value || '').trim().toLowerCase();
        if (raw.startsWith('f')) return 'fall';
        if (raw.startsWith('w')) return 'winter';
        if (raw.startsWith('s')) return 'spring';
        if (raw.startsWith('su')) return 'summer';
        return raw || 'unknown';
    }

    function normalizeCourseCode(value) {
        return String(value || '')
            .toUpperCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeInstructor(value) {
        const raw = String(value || '').trim();
        return raw || 'TBD';
    }

    function normalizeDayPattern(value) {
        return String(value || '').toUpperCase().replace(/\s+/g, '');
    }

    function normalizeTime(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        const match = raw.match(/(\d{1,2}):(\d{2})/);
        if (!match) return raw;
        return `${match[1].padStart(2, '0')}:${match[2]}`;
    }

    function normalizeSlot(days, startTime, endTime) {
        const dayPattern = normalizeDayPattern(days);
        const start = normalizeTime(startTime);
        const end = normalizeTime(endTime);
        if (!dayPattern && !start && !end) return 'unspecified';
        if (start && end) return `${dayPattern || '??'} ${start}-${end}`;
        if (start) return `${dayPattern || '??'} ${start}`;
        return `${dayPattern || '??'} unknown`;
    }

    function normalizeRecord(record = {}) {
        const capacity = toNumber(record.Capacity ?? record.capacity);
        const enrolled = toNumber(record.Enrolled ?? record.enrolled);
        const waitlist = toNumber(record.Waitlist ?? record.waitlist);
        const section = String(record.Section ?? record.section ?? '').trim();

        return {
            academicYear: String(record.AcademicYear ?? record.academicYear ?? '').trim(),
            quarter: normalizeQuarter(record.Quarter ?? record.quarter),
            courseCode: normalizeCourseCode(record.CourseCode ?? record.courseCode),
            section,
            instructor: normalizeInstructor(record.Instructor ?? record.instructor),
            capacity,
            enrolled,
            waitlist,
            campus: String(record.Campus ?? record.campus ?? '').trim(),
            days: String(record.Days ?? record.days ?? '').trim(),
            startTime: normalizeTime(record.StartTime ?? record.startTime),
            endTime: normalizeTime(record.EndTime ?? record.endTime),
            slot: normalizeSlot(record.Days ?? record.days, record.StartTime ?? record.startTime, record.EndTime ?? record.endTime),
            fillRate: capacity > 0 ? enrolled / capacity : 0
        };
    }

    function confidenceFromSample(sampleSize, consistencyScore = 0.75) {
        const sampleComponent = clamp(Math.log(sampleSize + 1) / Math.log(12), 0, 1);
        const consistency = clamp(consistencyScore, 0, 1);
        return Number(clamp((sampleComponent * 0.65) + (consistency * 0.35), 0.1, 0.99).toFixed(2));
    }

    function describeMetric(metric, value) {
        if (metric === 'fillRate') return `${Math.round(value * 100)}% avg fill`;
        if (metric === 'waitlist') return `${value.toFixed(1)} avg waitlist`;
        if (metric === 'sections') return `${value.toFixed(1)} avg sections`;
        return `${value}`;
    }

    function pushPattern(patterns, pattern) {
        if (!pattern || !Number.isFinite(pattern.sampleSize) || pattern.sampleSize < MIN_PATTERN_SAMPLES) {
            return;
        }
        patterns.push(pattern);
    }

    function summarizeByCourseSlot(rows, patterns) {
        const buckets = new Map();
        rows.forEach((row) => {
            if (!row.courseCode) return;
            const key = `${row.courseCode}::${row.slot}`;
            if (!buckets.has(key)) {
                buckets.set(key, { key, rows: [] });
            }
            buckets.get(key).rows.push(row);
        });

        buckets.forEach(({ rows: bucketRows }) => {
            const sampleSize = bucketRows.length;
            const avgFill = bucketRows.reduce((sum, row) => sum + row.fillRate, 0) / sampleSize;
            const avgWaitlist = bucketRows.reduce((sum, row) => sum + row.waitlist, 0) / sampleSize;
            const fillVariance = bucketRows.reduce((sum, row) => sum + Math.abs(row.fillRate - avgFill), 0) / sampleSize;

            let type = 'neutral';
            if (avgFill >= HIGH_FILL_THRESHOLD && avgWaitlist <= 1) type = 'success';
            else if (avgFill <= LOW_FILL_THRESHOLD || avgWaitlist >= HIGH_WAITLIST_THRESHOLD) type = 'problem';

            pushPattern(patterns, {
                id: `slot:${bucketRows[0].courseCode}:${bucketRows[0].slot}`,
                category: 'course_time_slot',
                type,
                courseCode: bucketRows[0].courseCode,
                slot: bucketRows[0].slot,
                sampleSize,
                confidence: confidenceFromSample(sampleSize, 1 - clamp(fillVariance, 0, 1)),
                metrics: {
                    fillRate: Number(avgFill.toFixed(3)),
                    waitlist: Number(avgWaitlist.toFixed(2))
                },
                explanation: `${bucketRows[0].courseCode} in ${bucketRows[0].slot}: ${describeMetric('fillRate', avgFill)}, ${describeMetric('waitlist', avgWaitlist)}`
            });
        });
    }

    function summarizeByFacultyCourse(rows, patterns) {
        const buckets = new Map();
        rows.forEach((row) => {
            if (!row.courseCode || !row.instructor || row.instructor === 'TBD') return;
            const key = `${row.courseCode}::${row.instructor}`;
            if (!buckets.has(key)) {
                buckets.set(key, { rows: [] });
            }
            buckets.get(key).rows.push(row);
        });

        buckets.forEach(({ rows: bucketRows }) => {
            const sampleSize = bucketRows.length;
            const avgFill = bucketRows.reduce((sum, row) => sum + row.fillRate, 0) / sampleSize;
            const avgWaitlist = bucketRows.reduce((sum, row) => sum + row.waitlist, 0) / sampleSize;
            const consistency = bucketRows.reduce((sum, row) => sum + Math.abs(row.fillRate - avgFill), 0) / sampleSize;

            let type = 'neutral';
            if (avgFill >= HIGH_FILL_THRESHOLD) type = 'success';
            else if (avgFill <= LOW_FILL_THRESHOLD && sampleSize >= 3) type = 'problem';

            pushPattern(patterns, {
                id: `faculty:${bucketRows[0].courseCode}:${bucketRows[0].instructor}`,
                category: 'faculty_course_affinity',
                type,
                courseCode: bucketRows[0].courseCode,
                instructor: bucketRows[0].instructor,
                sampleSize,
                confidence: confidenceFromSample(sampleSize, 1 - clamp(consistency, 0, 1)),
                metrics: {
                    fillRate: Number(avgFill.toFixed(3)),
                    waitlist: Number(avgWaitlist.toFixed(2))
                },
                explanation: `${bucketRows[0].instructor} teaching ${bucketRows[0].courseCode}: ${describeMetric('fillRate', avgFill)}.`
            });
        });
    }

    function summarizeQuarterDemand(rows, patterns) {
        const buckets = new Map();
        rows.forEach((row) => {
            if (!row.courseCode || !row.quarter) return;
            const key = `${row.courseCode}::${row.quarter}`;
            if (!buckets.has(key)) {
                buckets.set(key, { rows: [] });
            }
            buckets.get(key).rows.push(row);
        });

        buckets.forEach(({ rows: bucketRows }) => {
            const sampleSize = bucketRows.length;
            const avgEnrollment = bucketRows.reduce((sum, row) => sum + row.enrolled, 0) / sampleSize;
            const avgWaitlist = bucketRows.reduce((sum, row) => sum + row.waitlist, 0) / sampleSize;
            const totalSections = bucketRows.length;

            let type = 'neutral';
            if (avgWaitlist >= HIGH_WAITLIST_THRESHOLD) type = 'problem';
            else if (avgEnrollment >= 18 && avgWaitlist <= 1) type = 'success';

            pushPattern(patterns, {
                id: `quarter:${bucketRows[0].courseCode}:${bucketRows[0].quarter}`,
                category: 'quarter_demand',
                type,
                courseCode: bucketRows[0].courseCode,
                quarter: bucketRows[0].quarter,
                sampleSize,
                confidence: confidenceFromSample(sampleSize, 0.8),
                metrics: {
                    enrollment: Number(avgEnrollment.toFixed(2)),
                    waitlist: Number(avgWaitlist.toFixed(2)),
                    sections: totalSections
                },
                explanation: `${bucketRows[0].courseCode} in ${bucketRows[0].quarter}: avg enrollment ${avgEnrollment.toFixed(1)}, avg waitlist ${avgWaitlist.toFixed(1)}.`
            });
        });
    }

    function summarizeSectionOptimization(rows, patterns) {
        const byCourseQuarterYear = new Map();

        rows.forEach((row) => {
            if (!row.courseCode || !row.quarter || !row.academicYear) return;
            const key = `${row.courseCode}::${row.quarter}::${row.academicYear}`;
            if (!byCourseQuarterYear.has(key)) {
                byCourseQuarterYear.set(key, {
                    courseCode: row.courseCode,
                    quarter: row.quarter,
                    academicYear: row.academicYear,
                    sections: 0,
                    totalEnrollment: 0,
                    totalWaitlist: 0
                });
            }
            const bucket = byCourseQuarterYear.get(key);
            bucket.sections += 1;
            bucket.totalEnrollment += row.enrolled;
            bucket.totalWaitlist += row.waitlist;
        });

        const byCourseQuarter = new Map();
        byCourseQuarterYear.forEach((value) => {
            const key = `${value.courseCode}::${value.quarter}`;
            if (!byCourseQuarter.has(key)) {
                byCourseQuarter.set(key, []);
            }
            byCourseQuarter.get(key).push(value);
        });

        byCourseQuarter.forEach((entries) => {
            const sampleSize = entries.length;
            const avgSections = entries.reduce((sum, item) => sum + item.sections, 0) / sampleSize;
            const avgWaitlist = entries.reduce((sum, item) => sum + item.totalWaitlist, 0) / sampleSize;

            let type = 'neutral';
            if (avgWaitlist >= HIGH_WAITLIST_THRESHOLD) type = 'problem';
            else if (avgWaitlist <= 1 && avgSections >= 1.5) type = 'success';

            pushPattern(patterns, {
                id: `sections:${entries[0].courseCode}:${entries[0].quarter}`,
                category: 'section_optimization',
                type,
                courseCode: entries[0].courseCode,
                quarter: entries[0].quarter,
                sampleSize,
                confidence: confidenceFromSample(sampleSize, 0.75),
                metrics: {
                    sections: Number(avgSections.toFixed(2)),
                    waitlist: Number(avgWaitlist.toFixed(2))
                },
                explanation: `${entries[0].courseCode} in ${entries[0].quarter}: ${describeMetric('sections', avgSections)}, ${describeMetric('waitlist', avgWaitlist)}.`
            });
        });
    }

    function buildRecommendations(patterns) {
        const recommendations = [];

        patterns.forEach((pattern) => {
            if (pattern.category === 'course_time_slot' && pattern.type === 'success') {
                recommendations.push({
                    type: 'preferred_time_slot',
                    confidence: pattern.confidence,
                    priority: pattern.confidence >= 0.75 ? 'high' : 'medium',
                    courseCode: pattern.courseCode,
                    slot: pattern.slot,
                    message: `Prefer ${pattern.courseCode} in ${pattern.slot} based on historical performance.`,
                    explanation: pattern.explanation,
                    learnedRule: {
                        ruleType: 'course_slot_affinity',
                        courseCode: pattern.courseCode,
                        preferredSlot: pattern.slot,
                        confidence: pattern.confidence
                    }
                });
            }

            if (pattern.category === 'course_time_slot' && pattern.type === 'problem') {
                recommendations.push({
                    type: 'avoid_time_slot',
                    confidence: pattern.confidence,
                    priority: 'high',
                    courseCode: pattern.courseCode,
                    slot: pattern.slot,
                    message: `Avoid scheduling ${pattern.courseCode} in ${pattern.slot} without mitigation.`,
                    explanation: pattern.explanation,
                    learnedRule: {
                        ruleType: 'course_slot_avoidance',
                        courseCode: pattern.courseCode,
                        slot: pattern.slot,
                        confidence: pattern.confidence
                    }
                });
            }

            if (pattern.category === 'faculty_course_affinity' && pattern.type === 'success') {
                recommendations.push({
                    type: 'faculty_affinity',
                    confidence: pattern.confidence,
                    priority: pattern.confidence >= 0.75 ? 'high' : 'medium',
                    courseCode: pattern.courseCode,
                    instructor: pattern.instructor,
                    message: `Prioritize ${pattern.instructor} for ${pattern.courseCode}.`,
                    explanation: pattern.explanation,
                    learnedRule: {
                        ruleType: 'faculty_course_affinity',
                        courseCode: pattern.courseCode,
                        instructor: pattern.instructor,
                        confidence: pattern.confidence
                    }
                });
            }

            if (pattern.category === 'faculty_course_affinity' && pattern.type === 'problem') {
                recommendations.push({
                    type: 'faculty_assignment_review',
                    confidence: pattern.confidence,
                    priority: 'medium',
                    courseCode: pattern.courseCode,
                    instructor: pattern.instructor,
                    message: `Review ${pattern.courseCode} assignment strategy for ${pattern.instructor}.`,
                    explanation: pattern.explanation,
                    learnedRule: {
                        ruleType: 'faculty_assignment_review',
                        courseCode: pattern.courseCode,
                        instructor: pattern.instructor,
                        confidence: pattern.confidence
                    }
                });
            }

            if (pattern.category === 'section_optimization' && pattern.type === 'problem') {
                recommendations.push({
                    type: 'section_adjustment',
                    confidence: pattern.confidence,
                    priority: 'high',
                    courseCode: pattern.courseCode,
                    quarter: pattern.quarter,
                    message: `Consider adding a section for ${pattern.courseCode} in ${pattern.quarter}.`,
                    explanation: pattern.explanation,
                    learnedRule: {
                        ruleType: 'section_expansion',
                        courseCode: pattern.courseCode,
                        quarter: pattern.quarter,
                        confidence: pattern.confidence
                    }
                });
            }

            if (pattern.category === 'section_optimization' && pattern.type === 'success') {
                recommendations.push({
                    type: 'section_baseline',
                    confidence: pattern.confidence,
                    priority: 'medium',
                    courseCode: pattern.courseCode,
                    quarter: pattern.quarter,
                    message: `Keep baseline section planning for ${pattern.courseCode} in ${pattern.quarter}.`,
                    explanation: pattern.explanation,
                    learnedRule: {
                        ruleType: 'section_baseline',
                        courseCode: pattern.courseCode,
                        quarter: pattern.quarter,
                        confidence: pattern.confidence
                    }
                });
            }

            if (pattern.category === 'quarter_demand' && pattern.type === 'problem') {
                recommendations.push({
                    type: 'demand_pressure',
                    confidence: pattern.confidence,
                    priority: 'high',
                    courseCode: pattern.courseCode,
                    quarter: pattern.quarter,
                    message: `Demand pressure detected for ${pattern.courseCode} in ${pattern.quarter}; review capacity and sequencing.`,
                    explanation: pattern.explanation,
                    learnedRule: {
                        ruleType: 'demand_pressure',
                        courseCode: pattern.courseCode,
                        quarter: pattern.quarter,
                        confidence: pattern.confidence
                    }
                });
            }

            if (pattern.category === 'quarter_demand' && pattern.type === 'success') {
                recommendations.push({
                    type: 'quarter_priority',
                    confidence: pattern.confidence,
                    priority: 'medium',
                    courseCode: pattern.courseCode,
                    quarter: pattern.quarter,
                    message: `Prioritize ${pattern.courseCode} offerings in ${pattern.quarter} based on sustained demand quality.`,
                    explanation: pattern.explanation,
                    learnedRule: {
                        ruleType: 'quarter_priority',
                        courseCode: pattern.courseCode,
                        quarter: pattern.quarter,
                        confidence: pattern.confidence
                    }
                });
            }
        });

        recommendations.sort((a, b) => b.confidence - a.confidence);

        // Keep recommendations explainable and bounded.
        return recommendations.slice(0, 30);
    }

    function identifySuccesses(patterns = null) {
        const source = Array.isArray(patterns)
            ? patterns
            : Array.isArray(lastAnalysis?.patterns)
                ? lastAnalysis.patterns
                : [];
        return source.filter((pattern) => pattern.type === 'success');
    }

    function identifyProblems(patterns = null) {
        const source = Array.isArray(patterns)
            ? patterns
            : Array.isArray(lastAnalysis?.patterns)
                ? lastAnalysis.patterns
                : [];
        return source.filter((pattern) => pattern.type === 'problem');
    }

    function getRecommendations(patterns = null) {
        const source = Array.isArray(patterns)
            ? patterns
            : Array.isArray(lastAnalysis?.patterns)
                ? lastAnalysis.patterns
                : [];
        return buildRecommendations(source);
    }

    function analyzePatterns(scheduleHistory) {
        const normalized = (Array.isArray(scheduleHistory) ? scheduleHistory : [])
            .map(normalizeRecord)
            .filter((row) => row.courseCode && row.quarter && row.academicYear);

        const patterns = [];
        summarizeByCourseSlot(normalized, patterns);
        summarizeByFacultyCourse(normalized, patterns);
        summarizeQuarterDemand(normalized, patterns);
        summarizeSectionOptimization(normalized, patterns);

        const successes = identifySuccesses(patterns);
        const problems = identifyProblems(patterns);
        const recommendations = getRecommendations(patterns);

        const learnedRules = recommendations.map((item, index) => ({
            id: `learned-rule-${index + 1}`,
            source: 'schedule_history_analyzer',
            confidence: item.confidence,
            priority: item.priority,
            ...item.learnedRule
        }));

        lastAnalysis = {
            generatedAt: new Date().toISOString(),
            totalRecords: normalized.length,
            academicYears: [...new Set(normalized.map((row) => row.academicYear))],
            patternCount: patterns.length,
            patterns,
            successes,
            problems,
            recommendations,
            learnedRules
        };

        return lastAnalysis;
    }

    function parseCsv(csvText) {
        const text = String(csvText || '').trim();
        if (!text) return [];
        const lines = text.split(/\r?\n/).filter(Boolean);
        if (lines.length < 2) return [];

        const headers = lines[0].split(',').map((h) => h.trim());
        const rows = [];

        for (let i = 1; i < lines.length; i += 1) {
            const values = lines[i].split(',');
            const row = {};
            headers.forEach((header, idx) => {
                row[header] = values[idx] ?? '';
            });
            rows.push(row);
        }

        return rows;
    }

    return {
        analyzePatterns,
        identifySuccesses,
        identifyProblems,
        getRecommendations,
        parseCsv,
        getLastAnalysis: () => lastAnalysis
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ScheduleHistoryAnalyzer;
}
