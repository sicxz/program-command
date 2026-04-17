describe('schedule-builder runtime rule synthesis', () => {
    let builder;
    let originalAddEventListener;

    beforeEach(() => {
        jest.resetModules();

        document.body.innerHTML = '';
        originalAddEventListener = document.addEventListener;
        document.addEventListener = jest.fn((eventName, handler, options) => {
            if (eventName === 'DOMContentLoaded') {
                return;
            }
            return originalAddEventListener.call(document, eventName, handler, options);
        });

        builder = require('../pages/schedule-builder.js');
    });

    afterEach(() => {
        document.addEventListener = originalAddEventListener;
    });

    test('builds room metadata from database inventory with fallback annotations', () => {
        const metadata = builder.buildRoomMetadataFromInventory(
            [
                {
                    room_code: '206',
                    name: '206 UX Lab',
                    campus: 'Catalyst (Spokane)',
                    capacity: 24,
                    room_type: 'computer-lab',
                    exclude_from_grid: false
                },
                {
                    room_code: 'CEB 102',
                    name: 'CEB 102',
                    campus: 'Cheney',
                    capacity: 24,
                    room_type: 'computer-lab',
                    exclude_from_grid: false
                }
            ],
            {
                campuses: {
                    catalyst: {
                        name: 'Catalyst (Spokane)',
                        rooms: [
                            {
                                id: '206',
                                note: 'Preferred UX space'
                            }
                        ]
                    }
                }
            }
        );

        expect(metadata.campuses.catalyst.rooms[0]).toEqual(
            expect.objectContaining({
                id: '206',
                name: '206 UX Lab',
                note: 'Preferred UX space'
            })
        );
        expect(metadata.campuses.cheney.rooms[0]).toEqual(
            expect.objectContaining({
                id: 'CEB 102',
                name: 'CEB 102'
            })
        );
    });

    test('builds runtime constraints rules from database rooms and constraint rows', () => {
        const runtimeRules = builder.buildRuntimeConstraintRules({
            rooms: [
                {
                    room_code: '206',
                    name: '206 UX Lab',
                    campus: 'Catalyst (Spokane)',
                    capacity: 24,
                    room_type: 'computer-lab',
                    exclude_from_grid: false
                },
                {
                    room_code: '207',
                    name: '207 Media Lab',
                    campus: 'Catalyst (Spokane)',
                    capacity: 24,
                    room_type: 'flex-space',
                    exclude_from_grid: true
                },
                {
                    room_code: 'CEB 102',
                    name: 'CEB 102',
                    campus: 'Cheney',
                    capacity: 24,
                    room_type: 'computer-lab',
                    exclude_from_grid: false
                }
            ],
            constraints: [
                {
                    id: 'constraint-evening',
                    constraint_type: 'evening_safety',
                    enabled: true,
                    rule_details: {
                        min_instructors: 2,
                        time_after: '16:00'
                    }
                },
                {
                    id: 'constraint-room',
                    constraint_type: 'room_restriction',
                    enabled: true,
                    rule_details: {
                        room: '212',
                        allowed_courses: ['DESN 301', 'DESN 359']
                    }
                }
            ]
        });

        expect(runtimeRules.campuses.catalyst.rooms).toEqual(['206', '207']);
        expect(runtimeRules.campuses.cheney.rooms).toEqual(['CEB 102']);
        expect(runtimeRules.facultyConstraints).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'constraint-evening',
                    rule: 'minimum-instructors-evening'
                })
            ])
        );
        expect(runtimeRules.roomConstraints).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'exclude-207',
                    room: '207',
                    type: 'exclude-from-grid'
                }),
                expect.objectContaining({
                    id: 'constraint-room',
                    room: '212',
                    type: 'room-assignment',
                    allowedCourses: ['DESN 301', 'DESN 359']
                })
            ])
        );
    });

    test('normalizes database courses into builder catalog shape', () => {
        const catalog = builder.buildCourseCatalogFromDbCourses([
            {
                code: 'ITDS 201',
                title: 'Interaction Design',
                default_credits: 4,
                typical_cap: 18,
                level: '200',
                quarters_offered: ['Fall', 'Spring']
            }
        ]);

        expect(catalog).toEqual({
            courses: [
                {
                    code: 'ITDS 201',
                    title: 'Interaction Design',
                    defaultCredits: 4,
                    typicalEnrollmentCap: 18,
                    level: '200',
                    offeredQuarters: ['Fall', 'Spring'],
                    required: false,
                    workloadMultiplier: 1,
                    isVariable: false
                }
            ]
        });
    });
});
