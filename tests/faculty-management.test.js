const fs = require('fs');
const path = require('path');
const vm = require('vm');

function flushPromises() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function createHarness(rows = [], options = {}) {
    const html = fs.readFileSync(path.resolve(__dirname, '../pages/faculty-management.html'), 'utf8');
    const source = fs.readFileSync(path.resolve(__dirname, '../pages/faculty-management.js'), 'utf8');
    document.documentElement.innerHTML = html;

    const domReadyHandlers = [];
    const originalAddEventListener = document.addEventListener.bind(document);
    const addEventListenerSpy = jest.spyOn(document, 'addEventListener').mockImplementation((eventName, handler, options) => {
        if (eventName === 'DOMContentLoaded') {
            domReadyHandlers.push(handler);
            return;
        }
        return originalAddEventListener(eventName, handler, options);
    });

    let authStateChangeHandler = null;
    const session = options.session === undefined ? { user: { id: 'editor-1' } } : options.session;
    const supabaseClient = {
        auth: {
            getSession: jest.fn().mockResolvedValue({ data: { session }, error: null }),
            onAuthStateChange: jest.fn(handler => {
                authStateChangeHandler = handler;
                return { data: { subscription: { unsubscribe: jest.fn() } } };
            })
        }
    };
    const getSupabaseClient = jest.fn(() => supabaseClient);
    const dbService = {
        getFaculty: jest.fn().mockResolvedValue(rows),
        getAcademicYears: jest.fn().mockResolvedValue(options.years || [
            { id: 'year-2025', year: '2025-26' },
            { id: 'year-2024', year: '2024-25' }
        ]),
        getDefaultTerm: jest.fn().mockResolvedValue(options.pinnedTerm || {
            academicYear: options.defaultYear || '2025-26',
            quarter: 'fall'
        }),
        getRoster: jest.fn().mockResolvedValue(options.roster || []),
        addFaculty: jest.fn(),
        updateFaculty: jest.fn(),
        saveAppointment: jest.fn(),
        removeAppointment: jest.fn()
    };
    const DefaultTerm = {
        resolve: jest.fn(() => ({ academicYear: options.defaultYear || '2025-26', quarter: 'fall' }))
    };
    const sandboxWindow = {
        document,
        dbService,
        DefaultTerm,
        getSupabaseClient,
        confirm: jest.fn(() => true),
        setTimeout: jest.fn()
    };
    const sandbox = {
        window: sandboxWindow,
        document,
        dbService,
        DefaultTerm,
        getSupabaseClient,
        Date,
        console,
        setTimeout: sandboxWindow.setTimeout
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'pages/faculty-management.js' });

    return {
        dbService,
        supabaseClient,
        sandbox,
        html,
        emitAuthStateChange(nextSession) {
            authStateChangeHandler?.('SIGNED_IN', nextSession);
        },
        async ready() {
            await domReadyHandlers[0]();
            await flushPromises();
        },
        cleanup() {
            addEventListenerSpy.mockRestore();
        }
    };
}

describe('Faculty Management page', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    let harness;

    afterEach(() => {
        harness?.cleanup();
        document.documentElement.innerHTML = '<head></head><body></body>';
        jest.restoreAllMocks();
    });

    test('renders every faculty row returned by getFaculty', async () => {
        harness = createHarness([
            { id: 'f1', name: 'A.Adams', email: 'a@ewu.edu', category: 'fullTime', max_workload: 45 },
            { id: 'f2', name: 'B.Brown', email: 'b@ewu.edu', category: 'former', max_workload: 30 }
        ]);
        await harness.ready();

        expect(harness.dbService.getFaculty).toHaveBeenCalledTimes(1);
        expect(document.querySelectorAll('#facultyTableBody tr')).toHaveLength(2);
        expect(document.getElementById('facultyTableBody').textContent).toContain('A.Adams');
        expect(document.getElementById('facultyTableBody').textContent).toContain('Former');
    });

    test('shows the existing-person message and adds no row for a duplicate result', async () => {
        const existing = { id: 'f1', name: 'A.Adams', email: 'a@ewu.edu', category: 'fullTime', max_workload: 45 };
        harness = createHarness([existing]);
        harness.dbService.addFaculty.mockResolvedValue(existing);
        await harness.ready();

        harness.sandbox.openAddFacultyModal();
        document.getElementById('facultyName').value = 'A. Adams';
        await harness.sandbox.handleFacultySubmit({ preventDefault: jest.fn() });

        expect(document.getElementById('toast').textContent).toBe('That person already exists as A.Adams');
        expect(document.querySelectorAll('#facultyTableBody tr')).toHaveLength(1);
        expect(harness.dbService.updateFaculty).not.toHaveBeenCalled();
    });

    test('edits with only the four editable fields', async () => {
        const existing = { id: 'f1', name: 'A.Adams', email: 'a@ewu.edu', category: 'fullTime', max_workload: 45 };
        harness = createHarness([existing]);
        harness.dbService.updateFaculty.mockResolvedValue({ ...existing, category: 'adjunct', max_workload: 30 });
        await harness.ready();

        harness.sandbox.openEditFacultyModal('f1');
        document.getElementById('facultyName').value = 'A.Adams';
        document.getElementById('facultyEmail').value = 'new@ewu.edu';
        document.getElementById('facultyCategory').value = 'adjunct';
        document.getElementById('facultyMaxWorkload').value = '30';
        await harness.sandbox.handleFacultySubmit({ preventDefault: jest.fn() });

        expect(harness.dbService.updateFaculty).toHaveBeenCalledWith('f1', {
            name: 'A.Adams',
            email: 'new@ewu.edu',
            category: 'adjunct',
            max_workload: 30
        });
    });

    test('retires by changing the category to former without any removal call', async () => {
        const existing = { id: 'f1', name: 'A.Adams', email: 'a@ewu.edu', category: 'fullTime', max_workload: 45 };
        harness = createHarness([existing]);
        harness.dbService.updateFaculty.mockResolvedValue({ ...existing, category: 'former' });
        await harness.ready();

        await harness.sandbox.retireFaculty('f1');

        expect(harness.sandbox.window.confirm).toHaveBeenCalled();
        expect(harness.dbService.updateFaculty).toHaveBeenCalledWith('f1', { category: 'former' });
        expect(Object.keys(harness.dbService)).not.toContain('deleteFaculty');
    });

    test('keeps People records free of deletion and loads the admin guard', () => {
        harness = createHarness([]);
        const pageSource = fs.readFileSync(path.resolve(__dirname, '../pages/faculty-management.js'), 'utf8');

        expect(harness.html).toContain('../js/auth-guard.js');
        expect(harness.html.toLowerCase()).not.toContain('>delete<');
        expect(pageSource).not.toMatch(/deleteFaculty|\.delete\s*\(/);
        const authGuardSource = fs.readFileSync(path.resolve(__dirname, '../js/auth-guard.js'), 'utf8');
        expect(authGuardSource).toContain('faculty-management');
        expect(authGuardSource).toContain('Faculty Management');
    });

    test('selects the academic year resolved by the default term', async () => {
        harness = createHarness([], {
            years: [
                { id: 'newest', year: '2026-27' },
                { id: 'default', year: '2025-26' }
            ],
            defaultYear: '2025-26'
        });

        await harness.ready();

        expect(harness.dbService.getDefaultTerm).toHaveBeenCalledTimes(1);
        expect(harness.sandbox.DefaultTerm.resolve).toHaveBeenCalledWith({
            pinned: { academicYear: '2025-26', quarter: 'fall' },
            now: expect.any(Date)
        });
        expect(document.getElementById('rosterYear').value).toBe('default');
        expect(harness.dbService.getRoster).toHaveBeenCalledWith('default');
    });

    test('groups the roster as Full-time then Adjunct with counts and name sorting', async () => {
        harness = createHarness([], {
            roster: [
                { id: 'a3', faculty: { name: 'C.Carter' }, category: 'adjunct' },
                { id: 'a2', faculty: { name: 'Z.Zimmer' }, category: 'fullTime' },
                { id: 'a1', faculty: { name: 'A.Adams' }, category: 'fullTime' }
            ]
        });

        await harness.ready();

        const headers = [...document.querySelectorAll('.roster-group-header')].map(row => row.textContent.trim());
        const names = [...document.querySelectorAll('tr[data-appointment-id] td:first-child')]
            .map(cell => cell.textContent.trim());
        expect(headers).toEqual(['Full-time (2)', 'Adjunct (1)']);
        expect(names).toEqual(['A.Adams', 'Z.Zimmer', 'C.Carter']);
    });

    test('adding an adjunct appointment sends no quarter', async () => {
        harness = createHarness([
            { id: 'f1', name: 'A.Adams', category: 'fullTime' },
            { id: 'f2', name: 'B.Brown', category: 'adjunct' },
            { id: 'f3', name: 'C.Carter', category: 'former' }
        ]);
        harness.dbService.saveAppointment.mockResolvedValue({
            id: 'a2', faculty_id: 'f2', academic_year_id: 'year-2025', category: 'adjunct'
        });
        await harness.ready();

        harness.sandbox.openAddAppointmentModal();
        expect(document.getElementById('appointmentFacultyId').textContent).not.toContain('C.Carter');
        expect([...document.querySelectorAll('#appointmentCategory option')].map(option => [option.textContent, option.value]))
            .toEqual([['Full-time', 'fullTime'], ['Adjunct', 'adjunct']]);
        document.getElementById('appointmentFacultyId').value = 'f2';
        harness.sandbox.handleAppointmentPersonChange();
        await harness.sandbox.handleAppointmentSubmit({ preventDefault: jest.fn() });

        const fields = harness.dbService.saveAppointment.mock.calls[0][0];
        expect(fields).toMatchObject({
            faculty_id: 'f2',
            academic_year_id: 'year-2025',
            category: 'adjunct'
        });
        expect(fields).not.toHaveProperty('quarter');
    });

    test('removes an appointment after confirmation and drops its row', async () => {
        const appointment = {
            id: 'a1',
            faculty_id: 'f1',
            faculty: { name: 'A.Adams' },
            category: 'fullTime'
        };
        harness = createHarness([], { roster: [appointment] });
        harness.dbService.removeAppointment.mockResolvedValue(true);
        await harness.ready();

        await harness.sandbox.removeRosterAppointment('a1');

        expect(harness.sandbox.window.confirm).toHaveBeenCalledWith(
            'Remove A.Adams from the 2025-26 roster? They stay on the People list.'
        );
        expect(harness.dbService.removeAppointment).toHaveBeenCalledWith('a1');
        expect(document.querySelectorAll('tr[data-appointment-id]')).toHaveLength(0);
        expect([...document.querySelectorAll('.roster-group-empty')].map(row => row.textContent.trim()))
            .toEqual(['None', 'None']);
    });

    test('adding a person also creates an appointment in the selected year', async () => {
        const added = { id: 'f2', name: 'B.Brown', email: 'b@ewu.edu', category: 'adjunct', max_workload: 30 };
        harness = createHarness([]);
        harness.dbService.addFaculty.mockResolvedValue(added);
        harness.dbService.saveAppointment.mockResolvedValue({
            id: 'a2',
            faculty_id: 'f2',
            academic_year_id: 'year-2025',
            category: 'adjunct'
        });
        await harness.ready();

        harness.sandbox.openAddFacultyModal();
        document.getElementById('facultyName').value = 'B.Brown';
        document.getElementById('facultyEmail').value = 'b@ewu.edu';
        document.getElementById('facultyCategory').value = 'adjunct';
        document.getElementById('facultyMaxWorkload').value = '30';
        await harness.sandbox.handleFacultySubmit({ preventDefault: jest.fn() });

        expect(harness.dbService.saveAppointment).toHaveBeenCalledWith({
            faculty_id: 'f2',
            academic_year_id: 'year-2025',
            category: 'adjunct'
        });
        expect(document.querySelectorAll('tr[data-appointment-id]')).toHaveLength(1);
    });

    test('signed-out init disables write controls, shows the notice, and re-checks auth changes', async () => {
        harness = createHarness([
            { id: 'f1', name: 'A.Adams', category: 'fullTime', max_workload: 45 }
        ], {
            session: null,
            roster: [{ id: 'a1', faculty_id: 'f1', faculty: { name: 'A.Adams' }, category: 'fullTime' }]
        });

        await harness.ready();

        expect(harness.supabaseClient.auth.getSession).toHaveBeenCalledTimes(1);
        expect(document.getElementById('addRosterButton').disabled).toBe(true);
        expect(document.getElementById('addFacultyButton').disabled).toBe(true);
        expect([...document.querySelectorAll('tr[data-appointment-id] button')].every(button => button.disabled)).toBe(true);
        expect([...document.querySelectorAll('tr[data-faculty-id] button')].every(button => button.disabled)).toBe(true);
        expect(document.getElementById('rosterAuthNotice').textContent.trim())
            .toBe('Sign in to change the roster. Viewing is open to everyone.');
        expect(document.getElementById('rosterAuthNotice').classList).not.toContain('ds-hidden');

        harness.emitAuthStateChange({ user: { id: 'editor-1' } });
        expect(document.getElementById('addRosterButton').disabled).toBe(false);
        expect(document.getElementById('rosterAuthNotice').classList).toContain('ds-hidden');
    });

    test('shows the editor sign-in message for a PGRST116 save error', async () => {
        harness = createHarness([{ id: 'f1', name: 'A.Adams', category: 'fullTime' }]);
        harness.dbService.saveAppointment.mockRejectedValue({
            code: 'PGRST116',
            message: 'Cannot coerce the result to a single JSON object'
        });
        await harness.ready();

        harness.sandbox.openAddAppointmentModal();
        document.getElementById('appointmentFacultyId').value = 'f1';
        harness.sandbox.handleAppointmentPersonChange();
        await harness.sandbox.handleAppointmentSubmit({ preventDefault: jest.fn() });

        expect(document.getElementById('toast').textContent).toBe('Not saved: sign in as an editor first.');
    });
});
