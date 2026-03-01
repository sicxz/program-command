const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadCatalogModule({
    responseValue = null,
    responseOk = true,
    pathname = '/'
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
        console,
        location: { pathname }
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

        expect(fetchMock).toHaveBeenCalledWith('data/eecs-department-catalog.json', { cache: 'no-store' });
        expect(snapshot.loaded).toBe(true);
        expect(snapshot.catalog.department.code).toBe('EECS');
        expect(snapshot.catalog.department.name).toBe('Electrical Engineering, Computer Science, and Cybersecurity');
        expect(snapshot.catalog.summary.programCount).toBe(3);
        expect(snapshot.catalog.summary.termCount).toBe(3);
        expect(snapshot.catalog.summary.roomInventoryCount).toBe(37);
        expect(snapshot.catalog.summary.nonRoomInventoryCount).toBe(6);
        expect(snapshot.catalog.summary.roomPlacementCount).toBe(246);
        expect(snapshot.catalog.summary.nonRoomPlacementCount).toBe(77);

        const programs = EECSDepartmentCatalog.getPrograms();
        const inventoryCounts = programs.map((program) => program.roomInventory.length);
        const nonRoomCounts = programs.map((program) => program.nonRoomInventory.length);

        expect(programs.map((program) => program.code)).toEqual(['CSCD', 'CYBR', 'ELEC']);
        expect(programs.map((program) => program.id)).toEqual(['cscd', 'cybr', 'elec']);
        expect(inventoryCounts).toEqual([15, 9, 13]);
        expect(nonRoomCounts).toEqual([2, 2, 2]);
        expect(EECSDepartmentCatalog.getProgram('cyber').displayName).toBe('Cybersecurity');
        expect(EECSDepartmentCatalog.getProgram('elec').id).toBe('elec');
        expect(EECSDepartmentCatalog.getProgramRoomInventory('ELEC')).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ campus: 'Spokane U-District', building: 'Catalyst Building, Spokane', room: '201' })
            ])
        );
        expect(EECSDepartmentCatalog.getProgramNonRoomInventory('CSCD')).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: 'arranged',
                    label: 'Spokane U-District / Arranged',
                    count: 36
                }),
                expect.objectContaining({
                    kind: 'unspecified-location',
                    label: 'Spokane U-District / Unspecified location',
                    count: 5
                })
            ])
        );
    });

    test('resolves the catalog path relative to compare pages', async () => {
        const catalogPath = path.resolve(__dirname, '..', 'data', 'eecs-department-catalog.json');
        const rawCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
        const { EECSDepartmentCatalog, fetchMock } = loadCatalogModule({
            responseValue: rawCatalog,
            pathname: '/pages/eaglenet-compare.html'
        });

        await EECSDepartmentCatalog.load();

        expect(fetchMock).toHaveBeenCalledWith('../data/eecs-department-catalog.json', { cache: 'no-store' });
    });

    test('formats room inventory entries for browser rendering', () => {
        const { EECSDepartmentCatalog } = loadCatalogModule();

        expect(EECSDepartmentCatalog.formatRoomInventoryEntry({
            campus: 'Cheney',
            building: 'Computer Engineering Bldg.',
            room: '105',
            count: 6
        })).toBe('Cheney / Computer Engineering Bldg. / 105 (6)');
        expect(EECSDepartmentCatalog.formatNonRoomInventoryEntry({
            kind: 'arranged',
            label: 'Spokane U-District / Arranged',
            count: 5
        })).toBe('Spokane U-District / Arranged (5)');
    });
});
