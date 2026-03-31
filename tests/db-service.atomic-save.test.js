describe('dbService.syncScheduledCoursesForAcademicYear', () => {
    function createConfiguredService({
        rpcResult = [],
        rpcError = null,
        authUserId = null,
        latestSaveMetadata = null,
        latestSaveMetadataError = null
    } = {}) {
        jest.resetModules();

        const departmentsQuery = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: 'dept-1' }, error: null })
        };

        const scheduledCoursesQuery = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            not: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
                data: latestSaveMetadata,
                error: latestSaveMetadataError
            })
        };

        const client = {
            from: jest.fn((table) => {
                if (table === 'departments') return departmentsQuery;
                if (table === 'scheduled_courses') return scheduledCoursesQuery;
                throw new Error(`Unexpected table: ${table}`);
            }),
            rpc: jest.fn().mockResolvedValue({ data: rpcResult, error: rpcError }),
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
        return { dbService, client, scheduledCoursesQuery };
    }

    afterEach(() => {
        delete global.isSupabaseConfigured;
        delete global.getSupabaseClient;
        delete global.CURRENT_DEPARTMENT_CODE;
    });

    test('calls year-scoped schedule sync RPC and returns write counts', async () => {
        const { dbService, client } = createConfiguredService({
            rpcResult: [{ updated_count: 2, inserted_count: 3, deleted_count: 1 }],
            authUserId: 'user-123'
        });

        const result = await dbService.syncScheduledCoursesForAcademicYear('ay-2026-27-id', [
            {
                courseId: 'course-1',
                facultyId: 'faculty-1',
                roomId: 'room-1',
                quarter: 'Fall',
                dayPattern: 'MW',
                timeSlot: '10:00-12:20',
                section: '001',
                projectedEnrollment: '24'
            }
        ]);

        expect(client.rpc).toHaveBeenCalledTimes(1);
        expect(client.rpc).toHaveBeenCalledWith('sync_scheduled_courses_for_academic_year', {
            p_academic_year_id: 'ay-2026-27-id',
            p_records: [
                {
                    course_id: 'course-1',
                    faculty_id: 'faculty-1',
                    room_id: 'room-1',
                    quarter: 'Fall',
                    day_pattern: 'MW',
                    time_slot: '10:00-12:20',
                    section: '001',
                    projected_enrollment: 24,
                    updated_by: 'user-123',
                    updated_at: null
                }
            ]
        });
        expect(result).toEqual({
            updated_count: 2,
            inserted_count: 3,
            deleted_count: 1
        });
    });

    test('validates required academicYearId before calling RPC', async () => {
        const { dbService, client } = createConfiguredService();

        await expect(
            dbService.syncScheduledCoursesForAcademicYear('', [])
        ).rejects.toThrow('academicYearId is required');

        expect(client.rpc).not.toHaveBeenCalled();
    });

    test('throws when RPC returns an error', async () => {
        const { dbService } = createConfiguredService({
            rpcResult: null,
            rpcError: { message: 'permission denied', code: '42501' }
        });

        await expect(
            dbService.syncScheduledCoursesForAcademicYear('ay-2026-27-id', [])
        ).rejects.toEqual({ message: 'permission denied', code: '42501' });
    });

    test('rejects invalid projected enrollment values', async () => {
        const { dbService, client } = createConfiguredService();

        await expect(
            dbService.syncScheduledCoursesForAcademicYear('ay-2026-27-id', [
                { quarter: 'Fall', projectedEnrollment: 'twenty' }
            ])
        ).rejects.toThrow('records[0].projected_enrollment must be an integer when provided');

        expect(client.rpc).not.toHaveBeenCalled();
    });

    test('honors explicit updatedBy values on records', async () => {
        const { dbService, client } = createConfiguredService({
            authUserId: 'auth-user-default'
        });

        await dbService.syncScheduledCoursesForAcademicYear('ay-2026-27-id', [
            {
                courseId: 'course-1',
                quarter: 'Fall',
                updatedBy: 'override-user'
            }
        ]);

        const payload = client.rpc.mock.calls[0][1];
        expect(payload.p_records[0].updated_by).toBe('override-user');
    });

    test('canonicalizes scheduler aliases against the academic-year snapshot before saving', async () => {
        const { dbService, client } = createConfiguredService({
            authUserId: 'auth-user-default'
        });

        await dbService.syncScheduledCoursesForAcademicYear('ay-2026-27-id', [
            {
                quarter: 'Fall',
                dayPattern: 'wm',
                timeSlot: '10:00-12:00'
            }
        ], {
            schedulerProfileSnapshot: {
                dayPatterns: [{ id: 'MW', aliases: ['WM'] }],
                timeSlots: [{ id: '10:00-12:20', aliases: ['10:00-12:00'] }]
            }
        });

        const payload = client.rpc.mock.calls[0][1];
        expect(payload.p_records[0].day_pattern).toBe('MW');
        expect(payload.p_records[0].time_slot).toBe('10:00-12:20');
    });

    test('normalizes reserved online placements before saving', async () => {
        const { dbService, client } = createConfiguredService({
            authUserId: 'auth-user-default'
        });

        await dbService.syncScheduledCoursesForAcademicYear('ay-2026-27-id', [
            {
                quarter: 'Fall',
                dayPattern: 'online',
                timeSlot: null
            }
        ]);

        const payload = client.rpc.mock.calls[0][1];
        expect(payload.p_records[0].day_pattern).toBe('ONLINE');
        expect(payload.p_records[0].time_slot).toBe('async');
    });

    test('getLatestScheduleSaveMetadata returns the most recent save attribution row', async () => {
        const latestRow = {
            updated_by: 'user-200',
            updated_at: '2026-02-28T19:00:00.000Z'
        };

        const { dbService, scheduledCoursesQuery } = createConfiguredService({
            latestSaveMetadata: latestRow
        });

        const result = await dbService.getLatestScheduleSaveMetadata('ay-2026-27-id');

        expect(scheduledCoursesQuery.eq).toHaveBeenCalledWith('academic_year_id', 'ay-2026-27-id');
        expect(scheduledCoursesQuery.order).toHaveBeenCalledWith('updated_at', { ascending: false });
        expect(result).toEqual(latestRow);
    });
});
