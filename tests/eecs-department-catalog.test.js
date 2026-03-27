const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadCatalogModule({
    responseValue = null,
    responseOk = true
} = {}) {
    const filePath = path.resolve(__dirname, '..', 'js', 'eecs-department-catalog.js');
    const source = fs.readFileSync(filePath, 'utf8');

    const fetchMock = jest.fn().mockResolvedValue({
        ok: responseOk,
        json: jest.fn().mockResolvedValue(responseValue)
    });

    const sandbox = {
        window: {},
        globalThis: {},
        fetch: fetchMock,
        module: { exports: {} },
        exports: {},
        console
    };

    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'js/eecs-department-catalog.js' });

    return {
        EECSDepartmentCatalog: sandbox.module.exports,
        fetchMock
    };
}

describe('EECSDepartmentCatalog', () => {
    test('normalizes the EECS source catalog into a department/program summary', async () => {
        const catalogPath = path.resolve(__dirname, '..', 'data', 'eecs-department-catalog.json');
        const rawCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
        const { EECSDepartmentCatalog, fetchMock } = loadCatalogModule({ responseValue: rawCatalog });

        const snapshot = await EECSDepartmentCatalog.load();

        expect(fetchMock).toHaveBeenCalledWith('../data/eecs-department-catalog.json', { cache: 'no-store' });
        expect(snapshot.loaded).toBe(true);
        expect(snapshot.catalog.department.code).toBe('EECS');
        expect(snapshot.catalog.summary.programCount).toBe(3);
        expect(snapshot.catalog.summary.termCount).toBe(3);
        expect(snapshot.catalog.summary.roomInventoryCount).toBeGreaterThan(0);

        const programs = EECSDepartmentCatalog.getPrograms();
        const inventoryCounts = programs.map((program) => program.roomInventory.length);

        expect(programs.map((program) => program.code)).toEqual(['CSCD', 'CYBR', 'ELEC']);
        expect(inventoryCounts).toEqual([18, 12, 17]);
        expect(EECSDepartmentCatalog.getProgram('cyber').displayName).toBe('Cybersecurity');
        expect(EECSDepartmentCatalog.getProgramRoomInventory('ELEC')).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ campus: 'Spokane U-District', building: 'Catalyst Building, Spokane', room: '201' })
            ])
        );
    });

    test('formats room inventory entries for browser rendering', () => {
        const { EECSDepartmentCatalog } = loadCatalogModule();

        expect(EECSDepartmentCatalog.formatRoomInventoryEntry({
            campus: 'Cheney',
            building: 'Computer Engineering Bldg.',
            room: '105',
            count: 6
        })).toBe('Cheney / Computer Engineering Bldg. / 105 (6)');
    });
});
