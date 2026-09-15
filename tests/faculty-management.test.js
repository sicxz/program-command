const fs = require('fs');
const path = require('path');
const vm = require('vm');

function flushPromises() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function createHarness(rows = []) {
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
        addFaculty: jest.fn(),
        updateFaculty: jest.fn()
    };
    const sandboxWindow = {
        document,
        dbService,
        confirm: jest.fn(() => true),
        setTimeout: jest.fn()
    };
    const sandbox = {
        window: sandboxWindow,
        document,
        dbService,
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
        expect(Object.keys(harness.dbService)).toEqual(['getFaculty', 'addFaculty', 'updateFaculty']);
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
});
