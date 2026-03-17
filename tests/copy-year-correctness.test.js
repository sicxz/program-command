/**
 * Copy Year correctness tests (Tree/C-13, issue #65).
 * - Tests cover normal copy and idempotent re-run.
 * - Tests verify no duplicate sections are created.
 * - Tests verify source year is unchanged.
 */

const ScheduleManager = require('../js/schedule-manager.js');

describe('Copy Year correctness', () => {
    beforeEach(async () => {
        localStorage.clear();
        await ScheduleManager.init({});
        ScheduleManager.clearAll();
    });

    afterEach(() => {
        localStorage.clear();
    });

    test('normal copy creates target year with same section count as source', () => {
        ScheduleManager.createBlankYear('2025-26');
        ScheduleManager.addCourseAssignment('2025-26', 'Fall', { courseCode: 'DESN 100', section: '001', credits: 5, enrollmentCap: 25, assignedFaculty: 'Faculty A' });
        ScheduleManager.addCourseAssignment('2025-26', 'Winter', { courseCode: 'DESN 200', section: '001', credits: 5, enrollmentCap: 20, assignedFaculty: 'Faculty B' });
        const sourceCount = ScheduleManager.getQuarterSchedule('2025-26', 'Fall').length +
            ScheduleManager.getQuarterSchedule('2025-26', 'Winter').length +
            ScheduleManager.getQuarterSchedule('2025-26', 'Spring').length;

        const result = ScheduleManager.createYearFromTemplate('2026-27', '2025-26');
        expect(result.success).toBe(true);
        expect(result.copiedFrom).toBe('2025-26');

        const targetCount = ScheduleManager.getQuarterSchedule('2026-27', 'Fall').length +
            ScheduleManager.getQuarterSchedule('2026-27', 'Winter').length +
            ScheduleManager.getQuarterSchedule('2026-27', 'Spring').length;
        expect(targetCount).toBe(sourceCount);
    });

    test('idempotent re-run: second copy to same year fails, no duplicate sections', () => {
        ScheduleManager.createBlankYear('2025-26');
        ScheduleManager.addCourseAssignment('2025-26', 'Fall', { courseCode: 'DESN 100', section: '001', credits: 5, enrollmentCap: 25, assignedFaculty: 'TBD' });
        const first = ScheduleManager.createYearFromTemplate('2026-27', '2025-26');
        expect(first.success).toBe(true);
        const targetSectionsAfterFirst = ScheduleManager.getQuarterSchedule('2026-27', 'Fall').length;

        const second = ScheduleManager.createYearFromTemplate('2026-27', '2025-26');
        expect(second.success).toBe(false);
        expect(second.errors).toContain('Year 2026-27 already exists');
        const targetSectionsAfterSecond = ScheduleManager.getQuarterSchedule('2026-27', 'Fall').length;
        expect(targetSectionsAfterSecond).toBe(targetSectionsAfterFirst);
    });

    test('source year is unchanged after copy', () => {
        ScheduleManager.createBlankYear('2025-26');
        ScheduleManager.addCourseAssignment('2025-26', 'Fall', { courseCode: 'DESN 368', section: '001', credits: 5, enrollmentCap: 20, assignedFaculty: 'Faculty X' });
        const sourceFallBefore = ScheduleManager.getQuarterSchedule('2025-26', 'Fall').slice();

        ScheduleManager.createYearFromTemplate('2026-27', '2025-26');
        const sourceFallAfter = ScheduleManager.getQuarterSchedule('2025-26', 'Fall');
        expect(sourceFallAfter.length).toBe(sourceFallBefore.length);
        expect(sourceFallAfter[0].courseCode).toBe(sourceFallBefore[0].courseCode);
        expect(sourceFallAfter[0].id).toBe(sourceFallBefore[0].id);
    });
});
