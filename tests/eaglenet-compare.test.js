const EagleNetCompare = require('../js/eaglenet-compare.js');
const EagleNetComparePage = require('../pages/eaglenet-compare.js');

describe('EagleNet comparison normalization and mismatch grouping', () => {
    test('treats formatting differences as exact matches after normalization', () => {
        const schedulerRows = [
            {
                academicYear: '2026-27',
                quarter: 'Fall',
                courseCode: 'DESN-100',
                section: '1',
                instructor: 'Travis Masingale',
                days: 'TTH',
                time: '9:00 AM - 10:50 AM',
                room: 'CEB 102',
                credits: 5
            }
        ];

        const eagleNetRows = [
            {
                academic_year: '2026/2027',
                term: 'FA',
                subject: 'DESN',
                catalog_number: '100',
                section: '001',
                faculty: 'Masingale, Travis',
                meeting_days: 'Tue/Thu',
                start_time: '0900',
                end_time: '1050',
                building: 'CEB',
                location: '102',
                credit_hours: '5'
            }
        ];

        const diff = EagleNetCompare.diffNormalizedSchedules(schedulerRows, eagleNetRows, {
            leftSource: 'scheduler',
            rightSource: 'eaglenet'
        });

        expect(diff.summary.leftRows).toBe(1);
        expect(diff.summary.rightRows).toBe(1);
        expect(diff.summary.compared).toBe(1);
        expect(diff.summary.exactMatches).toBe(1);
        expect(diff.summary.totalDifferences).toBe(0);
    });

    test('categorizes missing, extra, and field mismatch rows', () => {
        const schedulerRows = [
            {
                academicYear: '2026-27',
                quarter: 'Fall',
                courseCode: 'DESN 101',
                section: '001',
                instructor: 'Travis Masingale',
                days: 'MW',
                time: '09:00-10:50',
                room: 'CEB 102',
                credits: 5
            },
            {
                academicYear: '2026-27',
                quarter: 'Winter',
                courseCode: 'DESN 202',
                section: '001',
                instructor: 'Mindy Breen',
                days: 'TR',
                time: '13:00-14:50',
                room: 'CEB 206',
                credits: 5
            }
        ];

        const eagleNetRows = [
            {
                academicYear: '2026-27',
                quarter: 'Fall',
                courseCode: 'DESN 101',
                section: '001',
                instructor: 'Travis Masingale',
                days: 'MW',
                time: '09:00-10:50',
                room: 'CEB 207',
                credits: 5
            },
            {
                academicYear: '2026-27',
                quarter: 'Spring',
                courseCode: 'DESN 300',
                section: '001',
                instructor: 'Sonja Durr',
                days: 'MW',
                time: '11:00-12:50',
                room: 'CEB 109',
                credits: 5
            }
        ];

        const diff = EagleNetCompare.diffNormalizedSchedules(schedulerRows, eagleNetRows, {
            leftSource: 'scheduler',
            rightSource: 'eaglenet'
        });

        expect(diff.summary.compared).toBe(1);
        expect(diff.summary.fieldMismatchRows).toBe(1);
        expect(diff.summary.missingInRight).toBe(1);
        expect(diff.summary.extraInRight).toBe(1);
        expect(diff.summary.totalDifferences).toBe(3);
        expect(diff.fieldMismatches[0].mismatches.some((mismatch) => mismatch.field === 'roomKey')).toBe(true);
    });
});

describe('EagleNet comparison page helpers', () => {
    test('parses CSV headers into normalized row keys', () => {
        const csv = [
            'Academic Year,Quarter,Course Code,Section,Instructor,Days,Time,Room,Credits',
            '2026-27,Fall,DESN 101,001,Travis Masingale,MW,09:00-10:50,CEB 102,5'
        ].join('\n');

        const rows = EagleNetComparePage.parseRowsInput(csv);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            academicYear: '2026-27',
            quarter: 'Fall',
            courseCode: 'DESN 101',
            section: '001',
            instructor: 'Travis Masingale'
        });
    });

    test('builds exportable discrepancy rows from diff output', () => {
        const diff = EagleNetCompare.diffNormalizedSchedules(
            [
                { academicYear: '2026-27', quarter: 'Fall', courseCode: 'DESN 101', section: '001', room: 'CEB 102' }
            ],
            [
                { academicYear: '2026-27', quarter: 'Fall', courseCode: 'DESN 101', section: '001', room: 'CEB 103' },
                { academicYear: '2026-27', quarter: 'Fall', courseCode: 'DESN 250', section: '001' }
            ],
            { leftSource: 'scheduler', rightSource: 'eaglenet' }
        );

        const rows = EagleNetComparePage.buildDiscrepancyRows(diff, '2026-27');
        const mismatchTypes = rows.map((row) => row.mismatchType);

        expect(rows.length).toBeGreaterThanOrEqual(2);
        expect(mismatchTypes).toContain('field_mismatch');
        expect(mismatchTypes).toContain('extra_in_eaglenet');
    });
});
