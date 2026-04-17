const ConstraintsEngine = require('../js/constraints-engine.js');

describe('ConstraintsEngine runtime rule input', () => {
    test('accepts a prebuilt rules object and derives rooms from campus data', async () => {
        const initialized = await ConstraintsEngine.init({
            courseConstraints: [],
            facultyConstraints: [
                {
                    id: 'evening-safety',
                    enabled: true,
                    rule: 'minimum-instructors-evening',
                    minimumCount: 2,
                    afterTime: '16:00'
                }
            ],
            roomConstraints: [
                {
                    id: 'exclude-207',
                    room: '207',
                    type: 'exclude-from-grid',
                    enabled: true
                }
            ],
            campuses: {
                catalyst: {
                    name: 'Catalyst (Spokane)',
                    rooms: [
                        { id: '206' },
                        { id: '207' },
                        { id: '209' }
                    ]
                },
                cheney: {
                    name: 'Cheney (Main Campus)',
                    rooms: ['CEB 102']
                }
            }
        });

        expect(initialized).toBe(true);
        expect(ConstraintsEngine.getAvailableRooms()).toEqual(['206', '209', 'CEB 102']);
        expect(ConstraintsEngine.getCampusForRoom('CEB 102')).toBe('cheney');
        expect(ConstraintsEngine.getConstraintById('exclude-207')).toEqual(
            expect.objectContaining({
                id: 'exclude-207',
                room: '207',
                type: 'exclude-from-grid'
            })
        );
    });
});
