const dbService = require('../js/db-service.js');

describe('dbService runtime source status', () => {
    function resetServiceState() {
        dbService.departmentId = null;
        dbService.departmentIdentity = null;
        dbService.departmentIdByCode = {};
        dbService.initialized = false;
        dbService.initializationPromise = null;
        dbService.resetRuntimeSourceStatus();
    }

    beforeEach(() => {
        resetServiceState();
        delete global.__PROGRAM_COMMAND_ACTIVE_PROFILE__;
    });

    afterEach(() => {
        resetServiceState();
        delete global.fetch;
        delete global.getSupabaseClient;
        delete global.getActiveDepartmentIdentity;
        delete global.isSupabaseConfigured;
        delete global.__PROGRAM_COMMAND_ACTIVE_PROFILE__;
    });

    test('records local fallback status when courses come from JSON', async () => {
        global.isSupabaseConfigured = jest.fn(() => false);
        global.fetch = jest.fn(async () => ({
            json: async () => ({
                courses: [
                    { code: 'DESN 101', title: 'Intro to Design' },
                    { code: 'DESN 201', title: 'Typography' }
                ]
            })
        }));

        const courses = await dbService.getCourses();
        const snapshot = dbService.getRuntimeSourceStatus();

        expect(courses).toHaveLength(2);
        expect(snapshot.supabaseConfigured).toBe(false);
        expect(snapshot.entries.courses).toEqual({
            key: 'courses',
            label: 'Courses',
            source: 'local-file',
            canonical: false,
            fallback: true,
            detail: '../data/course-catalog.json',
            count: 2,
            message: 'Courses are loading from the local course catalog fallback because Supabase is not configured.'
        });
    });

    test('records canonical database status when courses load from Supabase', async () => {
        global.isSupabaseConfigured = jest.fn(() => true);
        global.getActiveDepartmentIdentity = jest.fn(() => ({
            code: 'ITDS',
            name: 'Interactive Technology + Design',
            displayName: 'EWU ITDS'
        }));

        const departmentSingle = jest.fn(async () => ({ data: { id: 'dept-itds' }, error: null }));
        const courseOrder = jest.fn(async () => ({
            data: [{ id: 'course-1', code: 'ITDS 101', title: 'Foundations' }],
            error: null
        }));

        global.getSupabaseClient = jest.fn(() => ({
            from: jest.fn((table) => {
                if (table === 'departments') {
                    return {
                        select: jest.fn(() => ({
                            eq: jest.fn(() => ({ single: departmentSingle }))
                        }))
                    };
                }

                if (table === 'courses') {
                    return {
                        select: jest.fn(() => ({
                            eq: jest.fn(() => ({ order: courseOrder }))
                        }))
                    };
                }

                throw new Error(`Unexpected table ${table}`);
            })
        }));

        const courses = await dbService.getCourses();
        const snapshot = dbService.getRuntimeSourceStatus();

        expect(courses).toHaveLength(1);
        expect(snapshot.supabaseConfigured).toBe(true);
        expect(snapshot.department).toEqual({
            code: 'ITDS',
            name: 'Interactive Technology + Design',
            displayName: 'EWU ITDS'
        });
        expect(snapshot.entries.courses).toEqual({
            key: 'courses',
            label: 'Courses',
            source: 'database',
            canonical: true,
            fallback: false,
            detail: 'courses',
            count: 1,
            message: 'Courses loaded from the canonical Supabase courses table.'
        });
    });

    test('deduplicates concurrent initialize calls against the same department lookup', async () => {
        global.isSupabaseConfigured = jest.fn(() => true);
        global.getActiveDepartmentIdentity = jest.fn(() => ({
            code: 'DESN',
            name: 'Design',
            displayName: 'EWU Design'
        }));

        let resolveDepartment;
        const departmentSingle = jest.fn(() => new Promise((resolve) => {
            resolveDepartment = () => resolve({ data: { id: 'dept-1' }, error: null });
        }));

        global.getSupabaseClient = jest.fn(() => ({
            from: jest.fn((table) => {
                if (table !== 'departments') {
                    throw new Error(`Unexpected table ${table}`);
                }

                return {
                    select: jest.fn(() => ({
                        eq: jest.fn(() => ({ single: departmentSingle }))
                    }))
                };
            })
        }));

        const first = dbService.initialize();
        const second = dbService.initialize();

        expect(departmentSingle).toHaveBeenCalledTimes(1);

        resolveDepartment();
        await Promise.all([first, second]);

        expect(dbService.departmentId).toBe('dept-1');
        expect(dbService.initializationPromise).toBeNull();
    });
});
