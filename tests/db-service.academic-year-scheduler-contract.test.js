describe('dbService.getOrCreateYear scheduler contract handling', () => {
    function createConfiguredService({
        existingYear = null,
        existingYearError = null,
        insertResult = null,
        insertError = null,
        updateResult = null,
        updateError = null,
        authUserId = 'user-123'
    } = {}) {
        jest.resetModules();

        const departmentsQuery = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: 'dept-1' }, error: null })
        };

        const academicYearsQuery = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
                data: existingYear,
                error: existingYearError
            }),
            update: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            single: jest.fn(async () => {
                if (academicYearsQuery.update.mock.calls.length > 0) {
                    return { data: updateResult, error: updateError };
                }
                return { data: insertResult, error: insertError };
            })
        };

        const client = {
            from: jest.fn((table) => {
                if (table === 'departments') return departmentsQuery;
                if (table === 'academic_years') return academicYearsQuery;
                throw new Error(`Unexpected table: ${table}`);
            }),
            auth: {
                getUser: jest.fn().mockResolvedValue({
                    data: { user: authUserId ? { id: authUserId } : null },
                    error: null
                })
            }
        };

        global.isSupabaseConfigured = jest.fn(() => true);
        global.getSupabaseClient = jest.fn(() => client);
        global.CURRENT_DEPARTMENT_CODE = 'DESN';

        const dbService = require('../js/db-service.js');
        return { dbService, client, academicYearsQuery };
    }

    const schedulerContractOptions = {
        schedulerProfileVersion: 'design-v1@v1',
        schedulerProfileSnapshot: {
            dayPatterns: [
                { id: 'mw', label: 'Mon / Wed', aliases: ['mw', 'wm'] }
            ],
            timeSlots: [
                { id: '10:00-12:20', label: 'Studio Block', aliases: ['10:00-12:00'], startMinutes: 600, endMinutes: 740 }
            ]
        }
    };

    afterEach(() => {
        delete global.isSupabaseConfigured;
        delete global.getSupabaseClient;
        delete global.CURRENT_DEPARTMENT_CODE;
    });

    test('stores scheduler contract when creating a new academic year', async () => {
        const insertedYear = {
            id: 'ay-1',
            year: '2026-27',
            scheduler_profile_version: 'design-v1@v1'
        };
        const { dbService, academicYearsQuery } = createConfiguredService({
            existingYear: null,
            insertResult: insertedYear
        });

        const result = await dbService.getOrCreateYear('2026-27', schedulerContractOptions);

        expect(academicYearsQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
            department_id: 'dept-1',
            year: '2026-27',
            scheduler_profile_version: 'design-v1@v1',
            scheduler_profile_snapshot: {
                dayPatterns: [
                    { id: 'MW', label: 'Mon / Wed', aliases: ['MW', 'WM'] }
                ],
                timeSlots: [
                    {
                        id: '10:00-12:20',
                        label: 'Studio Block',
                        aliases: ['10:00-12:20', '10:00-12:00'],
                        startMinutes: 600,
                        endMinutes: 740
                    }
                ]
            },
            updated_by: 'user-123'
        }));
        expect(result).toEqual(insertedYear);
    });

    test('backfills scheduler contract onto an existing year when missing', async () => {
        const existingYear = {
            id: 'ay-1',
            year: '2026-27',
            scheduler_profile_version: null,
            scheduler_profile_snapshot: null
        };
        const updatedYear = {
            ...existingYear,
            scheduler_profile_version: 'design-v1@v1',
            scheduler_profile_snapshot: { dayPatterns: [{ id: 'MW' }], timeSlots: [{ id: '10:00-12:20' }] }
        };
        const { dbService, academicYearsQuery } = createConfiguredService({
            existingYear,
            updateResult: updatedYear
        });

        const result = await dbService.getOrCreateYear('2026-27', schedulerContractOptions);

        expect(academicYearsQuery.update).toHaveBeenCalledWith(expect.objectContaining({
            scheduler_profile_version: 'design-v1@v1',
            scheduler_profile_snapshot: expect.objectContaining({
                dayPatterns: expect.any(Array),
                timeSlots: expect.any(Array)
            }),
            updated_by: 'user-123',
            updated_at: expect.any(String)
        }));
        expect(result).toEqual(updatedYear);
    });

    test('does not overwrite an existing scheduler contract for the year', async () => {
        const existingYear = {
            id: 'ay-1',
            year: '2026-27',
            scheduler_profile_version: 'design-v1@v1',
            scheduler_profile_snapshot: {
                dayPatterns: [{ id: 'MW', label: 'Mon / Wed', aliases: ['MW'] }],
                timeSlots: [{ id: '10:00-12:20', label: 'Studio Block', aliases: ['10:00-12:20'] }]
            }
        };
        const { dbService, academicYearsQuery } = createConfiguredService({
            existingYear
        });

        const result = await dbService.getOrCreateYear('2026-27', {
            schedulerProfileVersion: 'itds-v1@v1',
            schedulerProfileSnapshot: {
                dayPatterns: [{ id: 'MTWRF', label: 'M-F' }],
                timeSlots: [{ id: '08:00-09:00', label: '8-9' }]
            }
        });

        expect(academicYearsQuery.update).not.toHaveBeenCalled();
        expect(academicYearsQuery.insert).not.toHaveBeenCalled();
        expect(result).toEqual(existingYear);
    });
});
