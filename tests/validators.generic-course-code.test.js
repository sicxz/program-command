const Validators = require('../js/validators.js');

describe('Validators generic course code support', () => {
    test('accepts non-DESN department course codes without warnings', () => {
        const result = Validators.validateCourse({
            courseCode: 'ITDS 499',
            credits: 5,
            quarter: 'Fall'
        });

        expect(result.valid).toBe(true);
        expect(result.warnings).toEqual([]);
    });
});
