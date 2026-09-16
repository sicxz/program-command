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
        endAppointment: jest.fn()
    };
    const DefaultTerm = {
        resolve: jest.fn(() => ({ academicYear: options.defaultYear || '2025-26', quarter: 'fall' }))
    };
    const sandboxWindow = {
        document,
        dbService,
        DefaultTerm,
        confirm: jest.fn(() => true),
        setTimeout: jest.fn()
    };
    const sandbox = {
        window: sandboxWindow,
        document,
        dbService,
        DefaultTerm,
        Date,
        console,
        setTimeout: sandboxWindow.setTimeout
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'pages/faculty-management.js' });

    return {
        dbService,
        sandbox,
        html,
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

    test('contains no removal control or removal code path and loads the admin guard', () => {
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

    test('renders roster rows and labels a null quarter as Year', async () => {
        harness = createHarness([], {
            roster: [{
                id: 'a1',
                faculty_id: 'f1',
                faculty: { name: 'A.Adams', email: 'a@ewu.edu', category: 'fullTime' },
                category: 'fullTime',
                rank: 'Professor',
                quarter: null,
                fte: 1,
                teaching_target: 45,
                start_date: '2025-09-01',
                end_date: null
            }]
        });

        await harness.ready();

        expect(document.querySelectorAll('#rosterTableBody tr')).toHaveLength(1);
        expect(document.getElementById('rosterTableBody').textContent).toContain('A.Adams');
        expect(document.getElementById('rosterTableBody').textContent).toContain('Year');
    });

    test('requires a quarter for adjunct appointments and hides it for full-time appointments', async () => {
        harness = createHarness([
            { id: 'f1', name: 'A.Adams', category: 'fullTime' },
            { id: 'f2', name: 'B.Brown', category: 'adjunct' },
            { id: 'f3', name: 'C.Carter', category: 'former' }
        ]);
        await harness.ready();

        harness.sandbox.openAddAppointmentModal();
        expect(document.getElementById('appointmentFacultyId').textContent).not.toContain('C.Carter');
        document.getElementById('appointmentCategory').value = 'adjunct';
        harness.sandbox.updateAppointmentQuarterVisibility();
        expect(document.getElementById('appointmentQuarter').required).toBe(true);
        expect(document.getElementById('appointmentQuarterGroup').hidden).toBe(false);

        document.getElementById('appointmentCategory').value = 'fullTime';
        harness.sandbox.updateAppointmentQuarterVisibility();
        expect(document.getElementById('appointmentQuarter').required).toBe(false);
        expect(document.getElementById('appointmentQuarterGroup').hidden).toBe(true);
    });

    test('ends an appointment with today and keeps the greyed row listed', async () => {
        jest.useFakeTimers({ now: new Date('2026-09-17T01:30:00.000Z') });
        const appointment = {
            id: 'a1',
            faculty_id: 'f1',
            faculty: { name: 'A.Adams' },
            category: 'fullTime',
            quarter: null,
            end_date: null
        };
        harness = createHarness([], { roster: [appointment] });
        harness.dbService.endAppointment.mockResolvedValue({ ...appointment, end_date: '2026-09-16' });
        const ready = harness.ready();
        await jest.runAllTimersAsync();
        await ready;

        await harness.sandbox.endRosterAppointment('a1');

        expect(harness.dbService.endAppointment).toHaveBeenCalledWith('a1', '2026-09-16');
        expect(document.querySelectorAll('#rosterTableBody tr')).toHaveLength(1);
        expect(document.querySelector('#rosterTableBody tr').classList).toContain('roster-row-ended');
    });

    test('adding a person also creates an appointment in the selected year', async () => {
        const added = { id: 'f2', name: 'B.Brown', email: 'b@ewu.edu', category: 'adjunct', max_workload: 30 };
        harness = createHarness([]);
        harness.dbService.addFaculty.mockResolvedValue(added);
        harness.dbService.saveAppointment.mockResolvedValue({
            id: 'a2',
            faculty_id: 'f2',
            academic_year_id: 'year-2025',
            category: 'adjunct',
            quarter: 'winter'
        });
        await harness.ready();

        harness.sandbox.openAddFacultyModal();
        document.getElementById('facultyName').value = 'B.Brown';
        document.getElementById('facultyEmail').value = 'b@ewu.edu';
        document.getElementById('facultyCategory').value = 'adjunct';
        harness.sandbox.updateFacultyQuarterVisibility();
        document.getElementById('facultyQuarter').value = 'winter';
        document.getElementById('facultyMaxWorkload').value = '30';
        await harness.sandbox.handleFacultySubmit({ preventDefault: jest.fn() });

        expect(harness.dbService.saveAppointment).toHaveBeenCalledWith({
            faculty_id: 'f2',
            academic_year_id: 'year-2025',
            quarter: 'winter',
            category: 'adjunct'
        });
        expect(document.querySelectorAll('#rosterTableBody tr')).toHaveLength(1);
    });
});
