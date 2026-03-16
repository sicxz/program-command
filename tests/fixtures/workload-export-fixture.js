/**
 * Fixture for workload export validation tests (single-faculty workbook).
 * Shape matches the faculty record used by buildQuarterExportRows in workload-export-mapping.js
 */
module.exports = {
    /** Minimal single-faculty record with one course per quarter */
    singleFacultyMinimal: {
        facultyName: 'Fixture Faculty',
        courses: [
            { quarter: 'Fall', courseCode: 'DESN 368', workloadCredits: 5, credits: 5, section: '001' },
            { quarter: 'Winter', courseCode: 'DESN 378', workloadCredits: 5, credits: 5, section: '001' },
            { quarter: 'Spring', courseCode: 'DESN 400', workloadCredits: 5, credits: 5, section: '002' }
        ]
    },
    /** Faculty with applied-learning courses (DESN 499) that aggregate into one row per quarter */
    singleFacultyWithAppliedLearning: {
        facultyName: 'Fixture Faculty',
        courses: [
            { quarter: 'Fall', courseCode: 'DESN 368', workloadCredits: 5, credits: 5, section: '001' },
            { quarter: 'Fall', courseCode: 'DESN 499', workloadCredits: 2, credits: 10, type: 'applied-learning' },
            { quarter: 'Winter', courseCode: 'DESN 499', workloadCredits: 1, credits: 5, type: 'applied-learning' }
        ]
    }
};
