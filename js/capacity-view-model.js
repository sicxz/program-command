/** Read-only teaching-capacity calculations for a single academic year. */
const CapacityViewModel = (function() {
    'use strict';

    const QUARTERS = ['Fall', 'Winter', 'Spring', 'Summer'];
    const APPLIED_CODES = ['DESN 399', 'DESN 491', 'DESN 495', 'DESN 499'];
    const round = value => Number(value.toFixed(3));
    const clone = value => JSON.parse(JSON.stringify(value));

    function number(value) {
        if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    }

    function quarterName(value) {
        return QUARTERS.find(name => name.toLowerCase() === String(value || '').toLowerCase()) || null;
    }

    function courseData(course) {
        const code = String(course.courseCode || course.code || '').trim().toUpperCase();
        const credits = number(course.credits);
        const multiplier = number(course.multiplier);
        const explicit = number(course.workloadCredits);
        // Respect the integration's profile-derived type/rate before legacy code defaults.
        const applied = course.type === 'applied-learning' || (course.type !== 'scheduled' && (
            multiplier !== null ? multiplier < 1
                : credits !== null && explicit !== null ? explicit < credits
                    : APPLIED_CODES.includes(code)
        ));
        return {
            ...course,
            courseCode: code,
            quarter: quarterName(course.quarter),
            applied,
            workloadCredits: explicit !== null ? explicit
                : credits !== null && multiplier !== null ? round(credits * multiplier)
                    : credits !== null && !applied ? credits : null
        };
    }

    function sumKnown(values) {
        return values.every(value => value !== null) ? round(values.reduce((sum, value) => sum + value, 0)) : null;
    }

    function fromCourses(courses, includeAppliedLearning) {
        const selected = includeAppliedLearning ? courses : courses.filter(course => !course.applied);
        return {
            recorded: courses.length > 0,
            workload: courses.length ? sumKnown(selected.map(course => course.workloadCredits)) : null,
            sections: courses.length ? selected.length : null
        };
    }

    function fromSummary(record, includeAppliedLearning, quarterly = false) {
        const total = number(quarterly ? record.workload : record.totalWorkloadCredits);
        const scheduled = number(record.scheduledCredits);
        const sections = number(record.sections);
        const recorded = total > 0 || scheduled > 0 || sections > 0;
        if (!recorded) return { recorded: false, workload: null, sections: null };
        const workload = includeAppliedLearning ? total : scheduled;
        // Summary-only records cannot establish a count of regular-course sections.
        return { recorded, workload, sections: includeAppliedLearning && sections > 0 ? sections : null };
    }

    function facultyRecords(yearData) {
        const records = new Map();
        [['all', null], ['fullTime', 'fullTime'], ['adjunct', 'adjunct'], ['former', 'former']].forEach(([key, category]) => {
            Object.entries(yearData[key] || {}).forEach(([name, data]) => {
                if (!data || typeof data !== 'object') return;
                const displayName = String(data.facultyName || name).trim();
                if (!records.has(displayName)) records.set(displayName, { ...data, facultyName: displayName });
                if (category && !records.get(displayName).category) records.get(displayName).category = category;
            });
        });
        return [...records.values()];
    }

    function targets(record, fallbackNames) {
        if (record.recordedTargetOnly) {
            return {
                grossTarget: null, release: null, netTarget: null, recordedTarget: number(record.recordedCapacity),
                targetInferred: true, targetSource: 'recorded'
            };
        }
        const ayGross = number(record.ayTargetCredits);
        const ayNet = number(record.ayNetTargetCredits);
        const ayRelease = number(record.ayReleaseCredits);
        const recordedTarget = number(record.maxWorkload);
        if (ayGross === null && ayNet === null && ayRelease === null) {
            return {
                grossTarget: null, release: null, netTarget: null, recordedTarget,
                targetInferred: recordedTarget !== null, targetSource: recordedTarget !== null ? 'recorded' : 'missing'
            };
        }
        const grossTarget = ayGross !== null ? ayGross : ayNet !== null && ayRelease !== null
            ? round(ayNet + ayRelease) : null;
        const release = ayRelease !== null ? ayRelease : grossTarget !== null && ayNet !== null
            ? round(Math.max(0, grossTarget - ayNet)) : null;
        const netTarget = ayNet !== null ? ayNet : grossTarget !== null && release !== null
            ? round(Math.max(0, grossTarget - release)) : null;
        return {
            grossTarget, release, netTarget, recordedTarget: null,
            targetInferred: netTarget !== null && (ayGross === null || fallbackNames.has(record.facultyName)),
            targetSource: netTarget === null ? 'missing'
                : fallbackNames.has(record.facultyName) ? 'default' : 'ay-setup'
        };
    }

    function build(yearData, options = {}) {
        const source = yearData && typeof yearData === 'object' ? yearData : {};
        const meta = clone(source.meta || {});
        const quarter = quarterName(options.quarter) || 'annual';
        const includeAppliedLearning = options.includeAppliedLearning !== false;
        const fallbackNames = new Set((meta.fallbackTargetRulesApplied || []).flatMap(rule => rule.matchedFaculty || []));
        const records = facultyRecords(source);
        if (!meta.ayFaculty && !meta.hasLiveSchedule && Array.isArray(options.recordedTargets)) {
            const names = new Set(records.map(record => record.facultyName.toLowerCase()));
            options.recordedTargets.forEach(target => {
                const name = String(target?.name || '').trim();
                if (name && !names.has(name.toLowerCase()) && number(target.capacity) !== null) {
                    records.push({ facultyName: name, category: 'fullTime', recordedTargetOnly: true, recordedCapacity: target.capacity });
                    names.add(name.toLowerCase());
                }
            });
        }
        const rowRecords = records.map(record => {
            const courses = (Array.isArray(record.courses) ? record.courses : []).map(courseData);
            const annual = courses.length ? fromCourses(courses, includeAppliedLearning) : fromSummary(record, includeAppliedLearning);
            const quarters = QUARTERS.map(name => {
                const matching = courses.filter(course => course.quarter === name);
                return { name, ...(matching.length ? fromCourses(matching, includeAppliedLearning)
                    : courses.length ? { recorded: false, workload: null, sections: null }
                        : fromSummary(record.byQuarter?.[name] || {}, includeAppliedLearning, true)) };
            });
            const category = ['fullTime', 'adjunct', 'former'].includes(record.category) ? record.category : 'other';
            const active = record.ayActive !== false && record.active !== false && category !== 'former';
            return {
                name: record.facultyName, category, active, rank: record.ayRole || record.rank || '',
                ...targets(record, fallbackNames), annual, quarters, hasCourseRows: courses.length > 0,
                releaseReason: record.ayReleaseReason || '',
                annualWorkload: annual.workload
            };
        });

        // The unresolved list is the source of truth; its summary is not added again.
        const unresolved = meta.unresolvedScheduleCourses || {};
        const unassignedAll = (Array.isArray(unresolved.courses) ? unresolved.courses : []).map(courseData);
        const unresolvedAnnual = unassignedAll.length ? fromCourses(unassignedAll, includeAppliedLearning)
            : fromSummary({ ...unresolved, sections: unresolved.sections ?? unresolved.count }, includeAppliedLearning);
        const unassignedQuarters = QUARTERS.map(name => {
            const matching = unassignedAll.filter(course => course.quarter === name);
            return { name, ...(matching.length ? fromCourses(matching, includeAppliedLearning)
                : unassignedAll.length ? { recorded: false, workload: null, sections: null }
                    : fromSummary(unresolved.byQuarter?.[name] || {}, includeAppliedLearning, true)) };
        });
        const quarters = QUARTERS.map((name, index) => {
            const buckets = [...rowRecords.map(row => row.quarters[index]), unassignedQuarters[index]];
            const recorded = buckets.some(bucket => bucket.recorded);
            const known = buckets.filter(bucket => bucket.recorded);
            return {
                name, recorded,
                workload: recorded ? sumKnown(known.map(bucket => bucket.workload)) : null,
                sections: recorded ? sumKnown(known.map(bucket => bucket.sections)) : null
            };
        });
        const hasWorkload = rowRecords.some(row => row.annual.recorded) || unresolvedAnnual.recorded;
        const scopeHasWorkload = quarter === 'annual' ? hasWorkload : quarters.find(bucket => bucket.name === quarter).recorded;
        const rows = rowRecords.map(row => {
            const bucket = quarter === 'annual' ? row.annual : row.quarters.find(item => item.name === quarter);
            // A faculty record with courses elsewhere has no assignments in a recorded quarter.
            const knownAbsence = quarter !== 'annual' && scopeHasWorkload && row.hasCourseRows && !bucket.recorded;
            const workload = knownAbsence ? 0 : bucket.workload;
            const sections = knownAbsence ? 0 : bucket.sections;
            return {
                name: row.name, category: row.category, active: row.active, rank: row.rank,
                grossTarget: row.grossTarget, release: row.release, netTarget: row.netTarget,
                recordedTarget: row.recordedTarget,
                targetInferred: row.targetInferred, targetSource: row.targetSource, releaseReason: row.releaseReason,
                workload, sections, annualWorkload: row.annualWorkload,
                overTarget: quarter === 'annual' && row.active && row.category === 'fullTime'
                    && row.annualWorkload !== null && row.netTarget !== null
                    ? round(Math.max(0, row.annualWorkload - row.netTarget)) : null
            };
        });
        const activeFullTime = rows.filter(row => row.active && row.category === 'fullTime');
        const targetKnown = activeFullTime.length > 0 && activeFullTime.every(row => row.netTarget !== null);
        const sumGroup = predicate => {
            if (!scopeHasWorkload) return null;
            const values = rowRecords.filter(predicate).map(row =>
                quarter === 'annual' ? row.annual : row.quarters.find(bucket => bucket.name === quarter))
                .filter(bucket => bucket.recorded).map(bucket => bucket.workload);
            return sumKnown(values);
        };
        const unresolvedScope = quarter === 'annual' ? unresolvedAnnual : unassignedQuarters.find(bucket => bucket.name === quarter);
        const unassignedWorkload = scopeHasWorkload ? unresolvedScope.recorded ? unresolvedScope.workload : 0 : null;
        const recordedRows = rowRecords.filter(row => quarter === 'annual' ? row.annual.recorded
            : row.quarters.find(bucket => bucket.name === quarter).recorded);
        const scopedBuckets = recordedRows.map(row => quarter === 'annual' ? row.annual : row.quarters.find(bucket => bucket.name === quarter));
        if (unresolvedScope.recorded) scopedBuckets.push(unresolvedScope);
        const totals = {
            grossTarget: activeFullTime.length ? sumKnown(activeFullTime.map(row => row.grossTarget)) : null,
            recordedTarget: activeFullTime.length ? sumKnown(activeFullTime.map(row => row.recordedTarget)) : null,
            release: activeFullTime.length ? sumKnown(activeFullTime.map(row => row.release)) : null,
            netTarget: targetKnown ? sumKnown(activeFullTime.map(row => row.netTarget)) : null,
            fullTimeWorkload: sumGroup(row => row.active && row.category === 'fullTime'),
            adjunctWorkload: sumGroup(row => row.active && row.category === 'adjunct'),
            otherWorkload: sumGroup(row => !row.active || !['fullTime', 'adjunct'].includes(row.category)),
            unassignedWorkload,
            totalWorkload: scopeHasWorkload ? sumKnown(scopedBuckets.map(bucket => bucket.workload)) : null,
            sections: scopeHasWorkload ? sumKnown(scopedBuckets.map(bucket => bucket.sections)) : null,
            overTarget: quarter === 'annual' && targetKnown && hasWorkload
                ? sumKnown(activeFullTime.map(row => row.overTarget)) : null,
            fullTimeCount: activeFullTime.length
        };
        const sourceKind = !hasWorkload ? 'missing'
            : meta.hasLiveSchedule ? 'draft'
                : meta.source === 'integrated' && meta.detailFaculty > 0 ? 'details' : 'historical';
        const assumptions = (meta.preliminaryAssumptions || []).filter(text =>
            sourceKind === 'draft' || !String(text).startsWith('Teaching workload is derived from the Program Command scheduler draft'));
        return {
            year: options.year || meta.year || '', quarter, includeAppliedLearning,
            rows, totals, quarters,
            unassigned: unassignedAll.filter(course => (quarter === 'annual' || course.quarter === quarter)
                && (includeAppliedLearning || !course.applied)),
            hasWorkload, annualHasWorkload: hasWorkload, scopeHasWorkload, targetKnown, sourceKind,
            recordedQuarters: quarters.filter(bucket => bucket.recorded).map(bucket => bucket.name),
            partialYear: hasWorkload && quarters.slice(0, 3).some(bucket => !bucket.recorded),
            rosterCount: rows.length, fullTimeCount: activeFullTime.length,
            assumptions: [...assumptions], meta
        };
    }

    function exactYearSource(workloadData, year) {
        const result = clone(workloadData && typeof workloadData === 'object' ? workloadData : {});
        if (!result.workloadByYear || typeof result.workloadByYear !== 'object') result.workloadByYear = {};
        if (!result.workloadByYear.byYear || typeof result.workloadByYear.byYear !== 'object') result.workloadByYear.byYear = {};
        if (!result.workloadByYear.byYear[year] || typeof result.workloadByYear.byYear[year] !== 'object') {
            result.workloadByYear.byYear[year] = { all: {}, fullTime: {}, adjunct: {}, former: {} };
        }
        return result;
    }

    return { build, exactYearSource };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CapacityViewModel;
