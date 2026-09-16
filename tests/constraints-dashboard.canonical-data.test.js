describe('constraints dashboard canonical data adapters', () => {
    let dashboard;
    let originalAddEventListener;

    beforeEach(() => {
        jest.resetModules();

        document.body.innerHTML = '<div id="runtimeDataSourceBanner" hidden></div>';
        originalAddEventListener = document.addEventListener;
        document.addEventListener = jest.fn((eventName, handler, options) => {
            if (eventName === 'DOMContentLoaded') {
                return;
            }
            return originalAddEventListener.call(document, eventName, handler, options);
        });

        dashboard = require('../pages/constraints-dashboard.js');
    });

    afterEach(() => {
        document.addEventListener = originalAddEventListener;
    });

    test('builds canonical dashboard rules from database-backed records', () => {
        const rules = dashboard.buildDashboardRulesFromCanonicalData({
            courses: [
                {
                    id: 'course-1',
                    code: 'DESN 301',
                    title: 'Visual Storytelling',
                    allowed_rooms: ['212'],
                    preferred_times: ['afternoon'],
                    preferred_days: ['TR'],
                    room_constraint_hard: true,
                    time_constraint_hard: false,
                    is_case_by_case: true
                },
                {
                    id: 'course-2',
                    code: 'DESN 200',
                    title: 'Visual Thinking',
                    allowed_rooms: null,
                    preferred_times: ['morning', 'afternoon', 'evening'],
                    preferred_days: ['MW', 'TR'],
                    room_constraint_hard: false,
                    time_constraint_hard: false,
                    is_case_by_case: false
                }
            ],
            faculty: [
                { id: 'faculty-1', name: 'M. Lybbert' }
            ],
            rooms: [
                {
                    id: 'room-1',
                    room_code: '207',
                    name: '207 Media Lab',
                    exclude_from_grid: true
                }
            ],
            constraints: [
                {
                    id: 'constraint-campus',
                    constraint_type: 'campus_transition',
                    enabled: true,
                    description: 'Travel between campuses',
                    rule_details: {
                        min_gap_hours: 0.5
                    }
                },
                {
                    id: 'constraint-evening',
                    constraint_type: 'evening_safety',
                    enabled: true,
                    description: 'Evening staffing',
                    rule_details: {
                        min_instructors: 2,
                        time_after: '16:00'
                    }
                },
                {
                    id: 'constraint-room',
                    constraint_type: 'room_restriction',
                    enabled: true,
                    description: 'Room 212 restriction',
                    rule_details: {
                        room: '212',
                        allowed_courses: ['DESN 301']
                    }
                }
            ],
            facultyPreferences: [
                {
                    id: 'pref-1',
                    faculty_id: 'faculty-1',
                    time_preferred: ['morning'],
                    time_blocked: ['evening'],
                    day_preferred: ['MW'],
                    day_blocked: ['TR'],
                    campus_assignment: 'cheney',
                    qualified_courses: ['DESN 301'],
                    notes: 'Prefers early studio blocks'
                }
            ]
        });

        expect(rules.courseConstraints).toEqual([
            expect.objectContaining({
                courseId: 'course-1',
                code: 'DESN 301',
                allowedRooms: ['212'],
                preferredTimes: ['afternoon'],
                preferredDays: ['TR'],
                roomConstraintHard: true
            })
        ]);

        expect(rules.facultyConstraints).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'constraint-campus',
                    rule: 'no-back-to-back-different-campus',
                    bufferMinutes: 30
                }),
                expect.objectContaining({
                    id: 'constraint-evening',
                    rule: 'minimum-instructors-evening',
                    minimumCount: 2
                })
            ])
        );

        expect(rules.roomConstraints).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'room-room-1',
                    type: 'exclude-from-grid',
                    room: '207'
                }),
                expect.objectContaining({
                    id: 'constraint-room',
                    type: 'room-assignment',
                    room: '212',
                    allowedCourses: ['DESN 301']
                })
            ])
        );

        expect(rules.facultyPreferences).toEqual([
            expect.objectContaining({
                facultyId: 'faculty-1',
                faculty: 'M. Lybbert',
                campusAssignment: 'cheney',
                qualifiedCourses: ['DESN 301']
            })
        ]);

        expect(rules.caseByCase.courses).toEqual(['DESN 301']);
    });

    test('renders success and warning data-source banners', () => {
        dashboard.__setRuntimeDataSourcesForTests({
            constraints: {
                label: 'Constraints',
                canonical: false
            }
        });

        const banner = document.getElementById('runtimeDataSourceBanner');
        let summary = dashboard.__getRuntimeDataSourceSummaryForTests();

        expect(summary.hasFallbacks).toBe(true);
        expect(banner.hidden).toBe(false);
        expect(banner.className).toContain('runtime-source-banner-warning');

        dashboard.__setRuntimeDataSourcesForTests({
            courses: {
                label: 'Courses',
                canonical: true
            },
            rooms: {
                label: 'Rooms',
                canonical: true
            }
        });

        summary = dashboard.__getRuntimeDataSourceSummaryForTests();

        expect(summary.hasFallbacks).toBe(false);
        expect(summary.canonicalCount).toBe(2);
        expect(banner.className).toContain('runtime-source-banner-success');
    });
});
