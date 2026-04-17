const dbService = require('../js/db-service.js');

describe('dbService academic year read path', () => {
    function resetServiceState() {
        dbService.departmentId = null;
        dbService.departmentIdentity = null;
        dbService.departmentIdByCode = {};
        dbService.initialized = false;
        dbService.resetRuntimeSourceStatus();
    }

    beforeEach(() => {
        resetServiceState();
        global.isSupabaseConfigured = jest.fn(() => true);
        global.getActiveDepartmentIdentity = jest.fn(() => ({
            code: 'DESN',
            name: 'Design',
            displayName: 'EWU Design'
        }));
    });

    afterEach(() => {
        resetServiceState();
        delete global.isSupabaseConfigured;
        delete global.getActiveDepartmentIdentity;
        delete global.getSupabaseClient;
    });

    test('getAcademicYear reads without creating a missing year row', async () => {
        const insertSpy = jest.fn();
        const maybeSingle = jest
            .fn()
            .mockResolvedValueOnce({ data: { id: 'dept-1' }, error: null })
            .mockResolvedValueOnce({ data: { id: 'year-1', year: '2025-26' }, error: null });

        global.getSupabaseClient = jest.fn(() => ({
            from: jest.fn((table) => {
                if (table === 'departments') {
                    return {
                        select: jest.fn(() => ({
                            eq: jest.fn(() => ({ single: maybeSingle }))
                        }))
                    };
                }

                if (table === 'academic_years') {
                    return {
                        select: jest.fn(() => ({
                            eq: jest.fn(() => ({
                                eq: jest.fn(() => ({ maybeSingle }))
                            }))
                        })),
                        insert: insertSpy
                    };
                }

                throw new Error(`Unexpected table ${table}`);
            })
        }));

        const year = await dbService.getAcademicYear('2025-26');

        expect(year).toEqual({ id: 'year-1', year: '2025-26' });
        expect(insertSpy).not.toHaveBeenCalled();
    });
});
