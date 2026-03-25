const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function loadJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

describe('DepartmentProfileManager onboarding helpers', () => {
    const manifest = loadJson('department-profiles/manifest.json');
    const designProfile = loadJson('department-profiles/design-v1.json');
    const pilotProfile = loadJson('department-profiles/itds-pilot-v1.json');

    beforeEach(() => {
        localStorage.clear();
        delete window.DepartmentProfileManager;
        delete window.__PROGRAM_COMMAND_ACTIVE_PROFILE__;

        global.fetch = jest.fn(async (url) => {
            const target = String(url || '');
            if (target.endsWith('/manifest.json') || target.endsWith('department-profiles/manifest.json')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => manifest
                };
            }
            if (target.endsWith('/design-v1.json') || target.endsWith('department-profiles/design-v1.json')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => designProfile
                };
            }
            if (target.endsWith('/itds-pilot-v1.json') || target.endsWith('department-profiles/itds-pilot-v1.json')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => pilotProfile
                };
            }
            return {
                ok: false,
                status: 404,
                json: async () => ({})
            };
        });

        const runtimeScript = fs.readFileSync(path.join(ROOT, 'js/department-profile.js'), 'utf8');
        window.eval(runtimeScript);
    });

    afterEach(() => {
        localStorage.clear();
        delete global.fetch;
        delete window.DepartmentProfileManager;
    });

    test('lists manifest and pilot profiles', async () => {
        const manager = window.DepartmentProfileManager;
        expect(manager).toBeDefined();

        const listing = await manager.listProfiles();
        const ids = listing.profiles.map((entry) => entry.id);

        expect(ids).toContain('design-v1');
        expect(ids).toContain('itds-pilot-v1');
    });

    test('saves custom profiles with versioned ids and loads them back', async () => {
        const manager = window.DepartmentProfileManager;
        await manager.initialize({ forceReload: true });

        const base = manager.getCurrentProfile();
        const draft = {
            ...base,
            identity: {
                ...base.identity,
                name: 'Test Department',
                code: 'TEST',
                displayName: 'EWU Test Department',
                shortName: 'Test'
            },
            scheduler: {
                ...base.scheduler,
                storageKeyPrefix: 'testSchedulerData_',
                allowedRooms: ['TEST 101', 'TEST 102'],
                roomLabels: {
                    'TEST 101': 'Test 101 Studio',
                    'TEST 102': 'Test 102 Lab'
                }
            }
        };

        const first = await manager.saveCustomProfile(draft, { baseId: 'test-department', activate: false });
        const second = await manager.saveCustomProfile(draft, { baseId: 'test-department', activate: false });

        expect(first.profileId).toBe('test-department-v01');
        expect(second.profileId).toBe('test-department-v02');

        const loaded = await manager.loadProfile(second.profileId);
        expect(loaded.source).toBe('custom-local');
        expect(loaded.profile.identity.code).toBe('TEST');

        const listing = await manager.listProfiles();
        const ids = listing.profiles.map((entry) => entry.id);
        expect(ids).toContain('test-department-v01');
        expect(ids).toContain('test-department-v02');
    });
});
