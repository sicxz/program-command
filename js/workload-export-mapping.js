/**
 * Workload export mapping: sheet name, required cells, quarter column map, and quarter row builder.
 * Used by workload-dashboard export and by tests/workload-export-validation.test.js.
 * Single source of truth for required sheets and cells so tests can detect missing or shifted fields.
 */
(function() {
    'use strict';

    const WORKLOAD_EXPORT_TEMPLATE_SHEET = 'Sheet1';

    const REQUIRED_HEADER_CELLS = ['A1', 'A2', 'B1', 'E1', 'H1'];
    const REQUIRED_SUMMARY_CELLS = ['P2', 'P8', 'O8'];

    function getQuarterColumnMap() {
        return {
            Fall: { course: 'B', note: 'C', credits: 'D' },
            Winter: { course: 'E', note: 'F', credits: 'G' },
            Spring: { course: 'H', note: 'I', credits: 'J' }
        };
    }

    function sortQuarterRows(rows) {
        return [...(rows || [])].sort((a, b) => {
            if ((a.sortOrder || 0) !== (b.sortOrder || 0)) {
                return (a.sortOrder || 0) - (b.sortOrder || 0);
            }
            return String(a.label || '').localeCompare(String(b.label || ''));
        });
    }

    /**
     * Build quarter export rows from a faculty record for the single-faculty workload workbook.
     * @param {object} facultyRecord - { courses: Array<{ quarter, courseCode, workloadCredits, credits, section, type }> }
     * @param {object} helpers - { getDepartmentIdentity(): { code }, isAppliedLearningCode(code): boolean, roundToTenths(n): number }
     * @returns {{ Fall: array, Winter: array, Spring: array }} each array has up to 6 rows with { label, note, credits, sortOrder }
     */
    function buildQuarterExportRows(facultyRecord, helpers) {
        const getDepartmentIdentity = helpers?.getDepartmentIdentity || (() => ({ code: 'DEPT' }));
        const isAppliedLearningCode = helpers?.isAppliedLearningCode || (() => false);
        const roundToTenths = helpers?.roundToTenths || ((n) => Math.round(Number(n) * 10) / 10);

        const quarters = { Fall: [], Winter: [], Spring: [] };
        const appliedTotals = {
            Fall: { credits: 0, count: 0, codes: new Set() },
            Winter: { credits: 0, count: 0, codes: new Set() },
            Spring: { credits: 0, count: 0, codes: new Set() }
        };

        const courses = Array.isArray(facultyRecord?.courses) ? facultyRecord.courses : [];
        courses.forEach((course, index) => {
            const quarter = ['Fall', 'Winter', 'Spring'].includes(course?.quarter) ? course.quarter : null;
            if (!quarter) return;

            const code = String(course?.courseCode || '').trim();
            const workloadCredits = Number.isFinite(Number(course?.workloadCredits))
                ? Number(course.workloadCredits)
                : Number(course?.credits) || 0;

            if (isAppliedLearningCode(code) || course?.type === 'applied-learning') {
                appliedTotals[quarter].credits += workloadCredits;
                appliedTotals[quarter].count += 1;
                if (code) appliedTotals[quarter].codes.add(code);
                return;
            }

            quarters[quarter].push({
                label: code || (getDepartmentIdentity().code || 'COURSE'),
                note: course?.section ? `Sec ${course.section}` : '',
                credits: roundToTenths(workloadCredits || course?.credits || 0),
                sortOrder: index
            });
        });

        ['Fall', 'Winter', 'Spring'].forEach((quarter) => {
            const applied = appliedTotals[quarter];
            if (applied.credits > 0) {
                const codeList = Array.from(applied.codes).sort().join('/');
                quarters[quarter].push({
                    label: `${getDepartmentIdentity().code || 'DEPT'} X95/99`,
                    note: codeList || 'Applied learning',
                    credits: roundToTenths(applied.credits),
                    sortOrder: 10_000
                });
            }
            quarters[quarter] = sortQuarterRows(quarters[quarter]);
            if (quarters[quarter].length > 6) {
                throw new Error(`${quarter} has ${quarters[quarter].length} workload rows after aggregation (template supports 6).`);
            }
            while (quarters[quarter].length < 6) {
                quarters[quarter].push({ label: '', note: '', credits: null, sortOrder: 99_999 });
            }
        });

        return quarters;
    }

    const api = {
        WORKLOAD_EXPORT_TEMPLATE_SHEET,
        REQUIRED_HEADER_CELLS,
        REQUIRED_SUMMARY_CELLS,
        getQuarterColumnMap,
        buildQuarterExportRows
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (typeof window !== 'undefined') {
        window.WorkloadExportMapping = api;
    }
})();
