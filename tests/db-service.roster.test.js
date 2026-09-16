function createQuery(result = { data: null, error: null }) {
    const query = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue(result),
        then(resolve, reject) {
            return Promise.resolve(result).then(resolve, reject);
        }
    };
    return query;
}

function createConfiguredService(tableQueries) {
    jest.resetModules();
    const departmentsQuery = createQuery({ data: { id: 'dept-1' }, error: null });
    const client = {
        from: jest.fn(table => {
            if (table === 'departments') return departmentsQuery;
            if (tableQueries[table]) return tableQueries[table];
            throw new Error(`Unexpected table: ${table}`);
        })
    };

    global.isSupabaseConfigured = jest.fn(() => true);
    global.getSupabaseClient = jest.fn(() => client);
    global.CURRENT_DEPARTMENT_CODE = 'DESN';

    return { dbService: require('../js/db-service.js'), client, departmentsQuery };
}

describe('dbService faculty roster functions', () => {
    afterEach(() => {
        delete global.isSupabaseConfigured;
        delete global.getSupabaseClient;
        delete global.CURRENT_DEPARTMENT_CODE;
        jest.restoreAllMocks();
    });

    test('getAcademicYears drops invalid year values and returns newest first', async () => {
        const rows = [
            { id: 'old', year: '2024-25' },
            { id: 'invalid', year: 'RLA147827' },
            { id: 'new', year: '2026-27' }
        ];
        const academicYearsQuery = createQuery({ data: rows, error: null });
        const { dbService } = createConfiguredService({ academic_years: academicYearsQuery });

        await expect(dbService.getAcademicYears()).resolves.toEqual([
            { id: 'new', year: '2026-27' },
            { id: 'old', year: '2024-25' }
        ]);
        expect(academicYearsQuery.eq).toHaveBeenCalledWith('department_id', 'dept-1');
        expect(academicYearsQuery.order).toHaveBeenCalledWith('year', { ascending: false });
    });

    test('getRoster joins faculty and orders by name then quarter', async () => {
        const rows = [{
            id: 'a1',
            academic_year_id: 'year-1',
            quarter: null,
            faculty: { name: 'A.Adams', email: 'a@ewu.edu', category: 'fullTime' }
        }];
        const rosterQuery = createQuery({ data: rows, error: null });
        const { dbService } = createConfiguredService({ faculty_appointments: rosterQuery });

        await expect(dbService.getRoster('year-1')).resolves.toBe(rows);
        expect(rosterQuery.select).toHaveBeenCalledWith('*, faculty:faculty(name, email, category)');
        expect(rosterQuery.eq).toHaveBeenCalledWith('academic_year_id', 'year-1');
        expect(rosterQuery.order).toHaveBeenNthCalledWith(1, 'faculty(name)');
        expect(rosterQuery.order).toHaveBeenNthCalledWith(2, 'quarter');
    });

    test('saveAppointment inserts without an id and updates with an id', async () => {
        const appointmentQuery = createQuery();
        appointmentQuery.single
            .mockResolvedValueOnce({ data: { id: 'a1', category: 'fullTime' }, error: null })
            .mockResolvedValueOnce({ data: { id: 'a1', category: 'adjunct' }, error: null });
        const { dbService } = createConfiguredService({ faculty_appointments: appointmentQuery });

        await expect(dbService.saveAppointment({
            faculty_id: 'f1',
            academic_year_id: 'year-1',
            category: 'fullTime'
        })).resolves.toEqual({ id: 'a1', category: 'fullTime' });
        expect(appointmentQuery.insert).toHaveBeenCalledWith({
            faculty_id: 'f1',
            academic_year_id: 'year-1',
            category: 'fullTime'
        });

        await expect(dbService.saveAppointment({ id: 'a1', category: 'adjunct' }))
            .resolves.toEqual({ id: 'a1', category: 'adjunct' });
        expect(appointmentQuery.update).toHaveBeenCalledWith({ category: 'adjunct' });
        expect(appointmentQuery.eq).toHaveBeenCalledWith('id', 'a1');
    });

    test('removeAppointment deletes the appointment and resolves true', async () => {
        const appointmentQuery = createQuery({ data: null, error: null });
        const { dbService } = createConfiguredService({ faculty_appointments: appointmentQuery });

        await expect(dbService.removeAppointment('a1')).resolves.toBe(true);
        expect(appointmentQuery.delete).toHaveBeenCalledTimes(1);
        expect(appointmentQuery.eq).toHaveBeenCalledWith('id', 'a1');
    });

    test.each([
        ['getAcademicYears', 'academic_years', service => service.getAcademicYears(), false],
        ['getRoster', 'faculty_appointments', service => service.getRoster('year-1'), false],
        ['saveAppointment', 'faculty_appointments', service => service.saveAppointment({ category: 'fullTime' }), true],
        ['removeAppointment', 'faculty_appointments', service => service.removeAppointment('a1'), false]
    ])('%s throws a Supabase error', async (name, table, invoke, resolvesAtSingle) => {
        const error = new Error(`${name} failed`);
        const query = createQuery({ data: null, error });
        if (resolvesAtSingle) query.single.mockResolvedValue({ data: null, error });
        const { dbService } = createConfiguredService({ [table]: query });

        await expect(invoke(dbService)).rejects.toBe(error);
    });
});
