const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('dbService.addFaculty', () => {
    function createConfiguredService(rows) {
        jest.resetModules();

        const departmentsQuery = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: 'dept-1' }, error: null })
        };
        const insertedRow = { id: 'new-id', name: 'Q.Newperson' };
        const facultyQuery = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({ data: rows, error: null }),
            insert: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: insertedRow, error: null })
        };
        const client = {
            from: jest.fn(table => {
                if (table === 'departments') return departmentsQuery;
                if (table === 'faculty') return facultyQuery;
                throw new Error(`Unexpected table: ${table}`);
            }),
            auth: {
                getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null })
            }
        };

        global.isSupabaseConfigured = jest.fn(() => true);
        global.getSupabaseClient = jest.fn(() => client);
        global.CURRENT_DEPARTMENT_CODE = 'DESN';

        return {
            dbService: require('../js/db-service.js'),
            facultyQuery,
            insertedRow
        };
    }

    afterEach(() => {
        delete global.isSupabaseConfigured;
        delete global.getSupabaseClient;
        delete global.CURRENT_DEPARTMENT_CODE;
        jest.restoreAllMocks();
    });

    test('returns an existing equivalent row without inserting', async () => {
        const existingRow = { id: 'mills-id', name: 'S.Mills' };
        const { dbService, facultyQuery } = createConfiguredService([existingRow]);
        jest.spyOn(console, 'warn').mockImplementation(() => {});

        await expect(dbService.addFaculty({ name: 'S. Mills' })).resolves.toBe(existingRow);

        expect(facultyQuery.insert).not.toHaveBeenCalled();
        expect(console.warn).toHaveBeenCalledWith('Faculty already exists: S. Mills');
    });

    test('inserts a genuinely new faculty name', async () => {
        const { dbService, facultyQuery, insertedRow } = createConfiguredService([
            { id: 'mills-id', name: 'S.Mills' }
        ]);

        await expect(dbService.addFaculty({ name: 'Q.Newperson' })).resolves.toBe(insertedRow);

        expect(facultyQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
            department_id: 'dept-1',
            name: 'Q.Newperson'
        }));
    });

    test('still inserts in a browser when faculty-utils has not been loaded', async () => {
        const departmentsQuery = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: 'dept-1' }, error: null })
        };
        const insertedRow = { id: 'new-id', name: 'Q.Newperson' };
        const facultyQuery = {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: insertedRow, error: null })
        };
        const client = {
            from: jest.fn(table => table === 'departments' ? departmentsQuery : facultyQuery),
            auth: {
                getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null })
            }
        };
        const browserGlobal = {
            console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
            CURRENT_DEPARTMENT_CODE: 'DESN',
            isSupabaseConfigured: jest.fn(() => true),
            getSupabaseClient: jest.fn(() => client)
        };
        browserGlobal.window = browserGlobal;
        vm.createContext(browserGlobal);
        const source = fs.readFileSync(path.join(__dirname, '../js/db-service.js'), 'utf8');

        vm.runInContext(source, browserGlobal, { filename: 'js/db-service.js' });

        await expect(browserGlobal.dbService.addFaculty({ name: 'Q.Newperson' }))
            .resolves.toEqual(insertedRow);
        expect(facultyQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Q.Newperson'
        }));
        expect(browserGlobal.console.warn).toHaveBeenCalledWith(
            'Faculty duplicate check unavailable; continuing with insert'
        );
    });
});
