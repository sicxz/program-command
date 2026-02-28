describe('dbService.syncScheduledCoursesForAcademicYear', () => {
    function createConfiguredService(rpcResult, rpcError = null) {
        jest.resetModules();

        const departmentsQuery = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: 'dept-1' }, error: null })
        };

        const client = {
            from: jest.fn((table) => {
                if (table === 'departments') return departmentsQuery;
                throw new Error(`Unexpected table: ${table}`);
            }),
            rpc: jest.fn().mockResolvedValue({ data: rpcResult, error: rpcError })
        };

        global.isSupabaseConfigured = jest.fn(() => true);
        global.getSupabaseClient = jest.fn(() => client);
        global.CURRENT_DEPARTMENT_CODE = 'DESN';

        const dbService = require('../js/db-service.js');
        return { dbService, client };
    }

    afterEach(() => {
        delete global.isSupabaseConfigured;
        delete global.getSupabaseClient;
        delete global.CURRENT_DEPARTMENT_CODE;
    });

    test('calls year-scoped schedule sync RPC and returns write counts', async () => {
        const { dbService, client } = createConfiguredService([
            { updated_count: 2, inserted_count: 3, deleted_count: 1 }
        ]);

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
        const { dbService, client } = createConfiguredService([]);

        await expect(
            dbService.syncScheduledCoursesForAcademicYear('', [])
        ).rejects.toThrow('academicYearId is required');

        expect(client.rpc).not.toHaveBeenCalled();
    });

    test('throws when RPC returns an error', async () => {
        const { dbService } = createConfiguredService(
            null,
            { message: 'permission denied', code: '42501' }
        );

        await expect(
            dbService.syncScheduledCoursesForAcademicYear('ay-2026-27-id', [])
        ).rejects.toEqual({ message: 'permission denied', code: '42501' });
    });

    test('rejects invalid projected enrollment values', async () => {
        const { dbService, client } = createConfiguredService([]);

        await expect(
            dbService.syncScheduledCoursesForAcademicYear('ay-2026-27-id', [
                { quarter: 'Fall', projectedEnrollment: 'twenty' }
            ])
        ).rejects.toThrow('records[0].projected_enrollment must be an integer when provided');

        expect(client.rpc).not.toHaveBeenCalled();
    });
});
