/**
 * [Tree/C-20] Export validation tests/fixtures for single-faculty workload workbook.
 * Validates required sheets and cells; fixture-based tests detect missing or shifted mapped fields.
 */

const WorkloadExportMapping = require('../js/workload-export-mapping.js');
const fixtures = require('./fixtures/workload-export-fixture.js');

function roundToTenths(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return 0;
    return Math.round(num * 10) / 10;
}

const appliedLearningCodes = new Set(['DESN 399', 'DESN 491', 'DESN 495', 'DESN 499']);
function isAppliedLearningCode(code) {
    const normalized = String(code || '').replace(/\s+/g, ' ').trim().toUpperCase();
    return normalized ? appliedLearningCodes.has(normalized) : false;
}

describe('Workload export mapping', () => {
    test('required sheet name and cells are defined and non-empty', () => {
        expect(WorkloadExportMapping.WORKLOAD_EXPORT_TEMPLATE_SHEET).toBe('Sheet1');
        expect(WorkloadExportMapping.REQUIRED_HEADER_CELLS).toEqual(['A1', 'A2', 'B1', 'E1', 'H1']);
        expect(WorkloadExportMapping.REQUIRED_SUMMARY_CELLS).toContain('P2');
        expect(WorkloadExportMapping.REQUIRED_SUMMARY_CELLS).toContain('P8');
        expect(WorkloadExportMapping.REQUIRED_SUMMARY_CELLS).toContain('O8');
    });

    test('quarter column map has Fall/Winter/Spring with course, note, credits columns', () => {
        const colMap = WorkloadExportMapping.getQuarterColumnMap();
        expect(colMap.Fall).toEqual({ course: 'B', note: 'C', credits: 'D' });
        expect(colMap.Winter).toEqual({ course: 'E', note: 'F', credits: 'G' });
        expect(colMap.Spring).toEqual({ course: 'H', note: 'I', credits: 'J' });
    });

    test('fixture minimal faculty produces quarter rows with required shape and exactly 6 rows per quarter', () => {
        const helpers = {
            getDepartmentIdentity: () => ({ code: 'DESN' }),
            isAppliedLearningCode,
            roundToTenths
        };
        const rows = WorkloadExportMapping.buildQuarterExportRows(fixtures.singleFacultyMinimal, helpers);

        ['Fall', 'Winter', 'Spring'].forEach((quarter) => {
            expect(Array.isArray(rows[quarter])).toBe(true);
            expect(rows[quarter].length).toBe(6);
            rows[quarter].forEach((row, i) => {
                expect(row).toHaveProperty('label');
                expect(row).toHaveProperty('note');
                expect(row).toHaveProperty('credits');
                expect(row).toHaveProperty('sortOrder');
            });
        });
        expect(rows.Fall[0].label).toBe('DESN 368');
        expect(rows.Fall[0].credits).toBe(5);
        expect(rows.Winter[0].label).toBe('DESN 378');
        expect(rows.Spring[0].label).toBe('DESN 400');
    });

    test('fixture with applied learning produces aggregated X95/99 row when applied credits present', () => {
        const helpers = {
            getDepartmentIdentity: () => ({ code: 'DESN' }),
            isAppliedLearningCode,
            roundToTenths
        };
        const rows = WorkloadExportMapping.buildQuarterExportRows(fixtures.singleFacultyWithAppliedLearning, helpers);

        expect(rows.Fall.some((r) => r.label && r.label.includes('X95/99'))).toBe(true);
        expect(rows.Winter.some((r) => r.label && r.label.includes('X95/99'))).toBe(true);
        expect(rows.Fall[0].label).toBe('DESN 368');
        expect(rows.Fall[1].label).toBe('DESN X95/99');
        expect(rows.Fall[1].credits).toBe(2);
    });

    test('missing or shifted mapped fields: column letters must match template', () => {
        const colMap = WorkloadExportMapping.getQuarterColumnMap();
        const quarters = ['Fall', 'Winter', 'Spring'];
        const expectedCols = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
        const seen = new Set();
        quarters.forEach((q) => {
            seen.add(colMap[q].course);
            seen.add(colMap[q].note);
            seen.add(colMap[q].credits);
        });
        expectedCols.forEach((c) => expect(seen.has(c)).toBe(true));
    });
});
