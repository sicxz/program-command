const dbService = require('../js/db-service.js');

describe('dbService department scoping', () => {
    function resetServiceState() {
        dbService.departmentId = null;
        dbService.departmentIdentity = null;
        dbService.departmentIdByCode = {};
        dbService.initialized = false;
    }

    function createDepartmentClient({ selectResponses = [], insertResponses = [] } = {}) {
        const eqCalls = [];
        const insertCalls = [];
        const selectSingle = jest.fn(() => Promise.resolve(selectResponses.shift() || { data: null, error: null }));
        const insertSingle = jest.fn(() => Promise.resolve(insertResponses.shift() || { data: null, error: null }));
        const client = {
            from: jest.fn((table) => {
                if (table !== 'departments') {
                    throw new Error(`Unexpected table ${table}`);
                }
                return {
                    select: jest.fn(() => ({
                        eq: jest.fn((field, value) => {
                            eqCalls.push({ field, value });
                            return { single: selectSingle };
                        })
                    })),
                    insert: jest.fn((payload) => {
                        insertCalls.push(payload);
                        return {
                            select: jest.fn(() => ({ single: insertSingle }))
                        };
                    })
                };
            })
        };

        return { client, eqCalls, insertCalls };
    }

    beforeEach(() => {
        resetServiceState();
        delete global.__PROGRAM_COMMAND_ACTIVE_PROFILE__;
        global.isSupabaseConfigured = jest.fn(() => true);
    });

    afterEach(() => {
        resetServiceState();
        delete global.isSupabaseConfigured;
        delete global.getSupabaseClient;
        delete global.__PROGRAM_COMMAND_ACTIVE_PROFILE__;
    });

    test('creates missing departments using the active profile identity', async () => {
        const { client, eqCalls, insertCalls } = createDepartmentClient({
            selectResponses: [{ data: null, error: { code: 'PGRST116' } }],
            insertResponses: [{ data: { id: 'dept-itds' }, error: null }]
        });

        global.getSupabaseClient = jest.fn(() => client);
        global.getActiveDepartmentIdentity = jest.fn(() => ({
            code: 'ITDS',
            name: 'Interactive Technology + Design',
            displayName: 'EWU ITDS'
        }));

        const departmentId = await dbService.initialize();

        expect(departmentId).toBe('dept-itds');
        expect(eqCalls).toEqual([{ field: 'code', value: 'ITDS' }]);
        expect(insertCalls).toEqual([{ code: 'ITDS', name: 'Interactive Technology + Design' }]);
        expect(dbService.departmentIdentity).toEqual({
            code: 'ITDS',
            name: 'Interactive Technology + Design',
            displayName: 'EWU ITDS'
        });
    });

    test('caches department ids per code and switches when the active profile changes', async () => {
        const { client, eqCalls } = createDepartmentClient({
            selectResponses: [
                { data: { id: 'dept-itds' }, error: null },
                { data: { id: 'dept-design' }, error: null }
            ]
        });

        global.getSupabaseClient = jest.fn(() => client);
        global.getActiveDepartmentIdentity = jest
            .fn()
            .mockReturnValueOnce({
                code: 'ITDS',
                name: 'Interactive Technology + Design',
                displayName: 'EWU ITDS'
            })
            .mockReturnValueOnce({
                code: 'DESN',
                name: 'Design',
                displayName: 'EWU Design'
            })
            .mockReturnValueOnce({
                code: 'ITDS',
                name: 'Interactive Technology + Design',
                displayName: 'EWU ITDS'
            });

        const first = await dbService.initialize();
        dbService.initialized = false;
        const second = await dbService.initialize();
        dbService.initialized = false;
        const third = await dbService.initialize();

        expect(first).toBe('dept-itds');
        expect(second).toBe('dept-design');
        expect(third).toBe('dept-itds');
        expect(eqCalls).toEqual([
            { field: 'code', value: 'ITDS' },
            { field: 'code', value: 'DESN' }
        ]);
    });
});
