const {
    buildCanonicalDashboardData
} = require('../js/canonical-dashboard-data.js');

describe('CanonicalDashboardData', () => {
    test('derives course and faculty analytics from scheduled course rows', () => {
        const result = buildCanonicalDashboardData({
            academicYear: '2026-27',
            profile: {
                workload: {
                    appliedLearningCourses: {
                        'ENGR 495': { title: 'Internship', rate: 0.1 }
                    }
                }
            },
            courses: [
                { code: 'ENGR 101', title: 'Intro to Engineering', default_credits: 5 },
                { code: 'ENGR 495', title: 'Internship', default_credits: 5 }
            ],
            faculty: [
                { id: 'f-1', name: 'Dr. Rivera', max_workload: 36 },
                { id: 'f-2', name: 'Prof. Chen', max_workload: 15 }
            ],
            scheduleRows: [
                {
                    quarter: 'Fall',
                    section: '001',
                    projected_enrollment: 24,
                    faculty_id: 'f-1',
                    faculty: { name: 'Dr. Rivera' },
                    course: { code: 'ENGR 101', title: 'Intro to Engineering', default_credits: 5 }
                },
                {
                    quarter: 'Winter',
                    section: '001',
                    projected_enrollment: 18,
                    faculty_id: 'f-1',
                    faculty: { name: 'Dr. Rivera' },
                    course: { code: 'ENGR 101', title: 'Intro to Engineering', default_credits: 5 }
                },
                {
                    quarter: 'Spring',
                    section: '040',
                    projected_enrollment: 12,
                    faculty_id: 'f-2',
                    faculty: { name: 'Prof. Chen' },
                    course: { code: 'ENGR 495', title: 'Internship', default_credits: 5 }
                }
            ]
        });

        expect(result.enrollmentData.courseStats['ENGR 101']).toMatchObject({
            average: 21,
            peak: 24,
            sections: 2,
            trend: 'declining'
        });

        expect(result.workloadData.facultyWorkload['Dr. Rivera']).toMatchObject({
            totalCredits: 10,
            totalStudents: 42,
            sections: 2,
            status: 'underloaded'
        });

        expect(result.workloadData.facultyWorkload['Prof. Chen']).toMatchObject({
            appliedLearningCredits: 5,
            totalWorkloadCredits: 0.5,
            sections: 1
        });

        expect(result.metadata).toMatchObject({
            academicYear: '2026-27',
            totalScheduledStudents: 54,
            missingProjectedEnrollmentCount: 0,
            totalScheduledSections: 3
        });
    });

    test('tracks missing projected enrollment without crashing', () => {
        const result = buildCanonicalDashboardData({
            courses: [
                { code: 'ENGR 201', title: 'Statics', default_credits: 5 }
            ],
            scheduleRows: [
                {
                    quarter: 'Fall',
                    section: '001',
                    course: { code: 'ENGR 201', title: 'Statics', default_credits: 5 }
                }
            ]
        });

        expect(result.enrollmentData.courseStats['ENGR 201']).toMatchObject({
            average: 0,
            peak: 0,
            sections: 1,
            trend: 'stable'
        });
        expect(result.metadata.missingProjectedEnrollmentCount).toBe(1);
    });
});
