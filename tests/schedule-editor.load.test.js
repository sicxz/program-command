const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function loadScheduleEditor(workload = { workloadByYear: {} }) {
    const source = fs.readFileSync(path.join(ROOT, 'pages/schedule-editor.js'), 'utf8');
    const element = {
        addEventListener: jest.fn(),
        appendChild: jest.fn(),
        querySelector: jest.fn(() => null),
        innerHTML: '',
        value: ''
    };
    const document = {
        addEventListener: jest.fn(),
        createElement: jest.fn(() => ({ dataset: {} })),
        getElementById: jest.fn(() => element)
    };
    const fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(workload)
    });
    const ScheduleManager = {
        init: jest.fn().mockResolvedValue(undefined),
        getAvailableYears: jest.fn(() => []),
        importFromWorkloadData: jest.fn(),
        yearExists: jest.fn(() => false),
        getCourseCatalog: jest.fn(() => [])
    };
    const sandbox = {
        ScheduleManager,
        console,
        document,
        fetch,
        setTimeout,
        window: {}
    };

    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'pages/schedule-editor.js' });

    return { fetch, sandbox };
}

describe('Schedule Editor workload loading', () => {
    test('loadData requests the root workload file', async () => {
        const { fetch, sandbox } = loadScheduleEditor();

        await sandbox.loadData();

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch.mock.calls[0][0]).toEqual(expect.any(String));
        expect(fetch.mock.calls[0][0].startsWith('../workload-data.json')).toBe(true);
    });

    test('buildFacultyList accepts workload data without academicYears', () => {
        const { sandbox } = loadScheduleEditor();
        vm.runInContext('workloadData = { workloadByYear: {} };', sandbox);

        expect(() => sandbox.buildFacultyList()).not.toThrow();
    });
});
