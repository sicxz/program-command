const dbService = require('../js/db-service.js');

describe('dbService.updateFaculty', () => {
    let client;
    let facultyQuery;

    beforeEach(() => {
        jest.resetAllMocks();
        dbService.initialized = true;
        dbService.departmentId = 'dept-1';

        facultyQuery = {
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
                data: { id: 'faculty-1', name: 'J.Smith', category: 'adjunct' },
                error: null
            })
        };
        client = {
            from: jest.fn(() => facultyQuery),
            auth: {
                getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null })
            }
        };
        global.isSupabaseConfigured = jest.fn(() => true);
        global.getSupabaseClient = jest.fn(() => client);
    });

    afterEach(() => {
        delete global.isSupabaseConfigured;
        delete global.getSupabaseClient;
    });

    test('updates only whitelisted faculty fields and records attribution', async () => {
        const result = await dbService.updateFaculty('faculty-1', {
            name: 'J.Smith',
            email: 'jsmith@ewu.edu',
            category: 'adjunct',
            max_workload: 30,
            department_id: 'other-department',
            id: 'changed-id',
            unexpected: true
        });

        expect(facultyQuery.update).toHaveBeenCalledWith({
            name: 'J.Smith',
            email: 'jsmith@ewu.edu',
            category: 'adjunct',
            max_workload: 30,
            updated_by: 'admin-1'
        });
        expect(facultyQuery.eq).toHaveBeenNthCalledWith(1, 'id', 'faculty-1');
        expect(facultyQuery.eq).toHaveBeenNthCalledWith(2, 'department_id', 'dept-1');
        expect(result).toEqual(expect.objectContaining({ id: 'faculty-1' }));
    });

    test('preserves explicit empty and zero values for allowed fields', async () => {
        await dbService.updateFaculty('faculty-1', { email: '', max_workload: 0 });

        expect(facultyQuery.update).toHaveBeenCalledWith({
            email: '',
            max_workload: 0,
            updated_by: 'admin-1'
        });
    });
});
