const ConflictEngine = require('../js/conflict-engine.js');

describe('ConflictEngine legacy constraint type aliases', () => {
    test('maps faculty_conflict to faculty_double_book checker', () => {
        const schedule = [
            { code: 'DESN 100', day: 'MW', time: '10:00-12:20', room: '206', instructor: 'A.Sopu' },
            { code: 'DESN 200', day: 'MW', time: '10:00-12:20', room: '209', instructor: 'A.Sopu' }
        ];
        const constraints = [
            {
                id: 'legacy-faculty',
                enabled: true,
                constraint_type: 'faculty_conflict',
                rule_details: { severity: 'critical' }
            }
        ];

        const result = ConflictEngine.evaluate(schedule, constraints);
        expect(result.conflicts.length).toBeGreaterThan(0);
        expect(result.conflicts[0].constraintType).toBe('faculty_double_book');
        expect(result.conflicts[0].constraintTypeOriginal).toBe('faculty_conflict');
    });

    test('maps room_conflict to room_double_book checker', () => {
        const schedule = [
            { code: 'DESN 100', day: 'TR', time: '13:00-15:20', room: '210', instructor: 'A.Sopu' },
            { code: 'DESN 216', day: 'TR', time: '13:00-15:20', room: '210', instructor: 'S.Durr' }
        ];
        const constraints = [
            {
                id: 'legacy-room',
                enabled: true,
                constraint_type: 'room_conflict',
                rule_details: { severity: 'critical' }
            }
        ];

        const result = ConflictEngine.evaluate(schedule, constraints);
        expect(result.conflicts.length).toBeGreaterThan(0);
        expect(result.conflicts[0].constraintType).toBe('room_double_book');
        expect(result.conflicts[0].constraintTypeOriginal).toBe('room_conflict');
    });

    test('maps student_pathway_conflict to student_conflict checker', () => {
        const schedule = [
            { code: 'DESN 100', day: 'MW', time: '13:00-15:20', room: 'CEB 102', instructor: 'A.Sopu' },
            { code: 'DESN 216', day: 'MW', time: '13:00-15:20', room: 'CEB 104', instructor: 'S.Durr' }
        ];
        const constraints = [
            {
                id: 'legacy-student',
                enabled: true,
                constraint_type: 'student_pathway_conflict',
                rule_details: { severity: 'critical' }
            }
        ];

        const result = ConflictEngine.evaluate(schedule, constraints);
        expect(result.conflicts.length).toBeGreaterThan(0);
        expect(result.conflicts[0].type).toBe('student-conflict');
        expect(result.conflicts[0].constraintType).toBe('student_conflict');
        expect(result.conflicts[0].constraintTypeOriginal).toBe('student_pathway_conflict');
    });
});
