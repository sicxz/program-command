const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function loadJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function createRuntimeHarness() {
    const source = fs.readFileSync(path.join(ROOT, 'js/eaglenet-seed.js'), 'utf8');
    const sandboxWindow = {
        location: { pathname: '/index.html' },
        fetch: jest.fn()
    };

    const sandbox = {
        window: sandboxWindow,
        globalThis: sandboxWindow,
        fetch: sandboxWindow.fetch,
        console,
        module: { exports: {} },
        exports: {}
    };

    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'js/eaglenet-seed.js' });

    return sandboxWindow.EagleNetSeed;
}

describe('EagleNetSeed runtime', () => {
    const seedPayload = loadJson('data/eecs-eaglenet-seed.json');

    test('loads the EECS manual seed schema and preserves workspace provenance', async () => {
        const runtime = createRuntimeHarness();
        const snapshot = await runtime.load('', { seedData: seedPayload, forceReload: true });

        expect(snapshot.loaded).toBe(true);
        expect(snapshot.source).toBe('memory');
        expect(snapshot.seed.metadata.sourceType).toBe('EagleNET classroom view with enrollments');
        expect(snapshot.seed.metadata.sourceFolder).toBe('course-enrollement-trends-2022-2025/eecs/output');
        expect(snapshot.seed.metadata.sourceFile).toBe('course-enrollement-trends-2022-2025/eecs/output/all_schedules.json');
        expect(snapshot.seed.metadata.recordCount).toBe(seedPayload.records.length);
        expect(snapshot.seed.metadata.workspaceCounts).toEqual({
            csee: 234,
            cyber: 89
        });
    });

    test('maps chair profiles to workspaces and derives runtime rooms from the source data', async () => {
        const runtime = createRuntimeHarness();
        await runtime.load('', { seedData: seedPayload, forceReload: true });

        expect(runtime.getWorkspaceIdForProfile('csee-chair-v1')).toBe('csee');
        expect(runtime.getWorkspaceIdForProfile('cyber-chair-v1')).toBe('cyber');

        const cseeRuntime = runtime.getRuntimeConfig('csee');
        expect(cseeRuntime.label).toBe('CS/EE');
        expect(cseeRuntime.academicYears).toEqual(['2025-26']);
        expect(cseeRuntime.allowedRooms).toContain('Catalyst 007');
        expect(cseeRuntime.allowedRooms).toContain('CEB 105');
        expect(cseeRuntime.roomLabels['Catalyst 007']).toBe('CAT 007');
        expect(cseeRuntime.roomLabels['CEB 105']).toBe('CHN 105');
        expect(cseeRuntime.dayPatterns.map((pattern) => pattern.id)).toEqual(
            expect.arrayContaining(['MTWRF', 'TR', 'T', 'W'])
        );
        expect(cseeRuntime.timeSlots.map((slot) => slot.id)).toEqual(
            expect.arrayContaining(['08:00-08:50', '09:00-09:50', '13:00-14:50'])
        );
    });

    test('builds a grid-ready draft and keeps arranged rows in review exceptions', async () => {
        const runtime = createRuntimeHarness();
        await runtime.load('', { seedData: seedPayload, forceReload: true });

        const preview = runtime.buildSchedulerDraft({
            workspaceId: 'csee',
            academicYear: '2026-27'
        });

        expect(preview.academicYear).toBe('2026-27');
        expect(preview.sourceAcademicYear).toBe('2025-26');
        expect(preview.summary.seededRecords).toBeGreaterThan(0);
        expect(preview.summary.exceptionCount).toBeGreaterThan(0);
        expect(preview.draft.fall.MTWRF['09:00-09:50']).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: 'CSCD 110',
                    section: '001',
                    room: 'CEB 106',
                    instructor: 'Lemelin, Rob'
                })
            ])
        );
        expect(preview.exceptions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: 'CSCD 399',
                    section: '004',
                    reason: expect.stringContaining('fixed room')
                })
            ])
        );
    });

    test('seeds only the latest source academic year when older history is present', async () => {
        const runtime = createRuntimeHarness();
        const historicalPayload = JSON.parse(JSON.stringify(seedPayload));
        historicalPayload.records.push({
            workspace_id: 'csee',
            workspace_label: 'CS/EE',
            workspace_display_name: 'Computer Science, Cybersecurity, and Electrical Engineering',
            workspace_programs: ['CSCD', 'ELEC'],
            source_index: 9999,
            title: 'LEGACY TEST COURSE',
            subject_description: 'Computer Science',
            subject_code: 'CSCD',
            catalog_number: '999',
            section: '001',
            credit_hours: '5',
            term: 'Fall 2024',
            normalized_term: 'Fall 2024',
            instructor_name: 'Legacy, Pat',
            meeting_days: 'MW',
            meeting_time: '09:00 AM - 10:50 AM',
            meeting_type: 'Class',
            campus: 'Cheney',
            building: 'Computer Engineering Bldg.',
            room: '105',
            schedule_type: '',
            attribute: '',
            crn: '',
            status_summary: 'Open',
            seats_remaining: '10',
            seats_capacity: '20',
            waitlist_remaining: '0',
            waitlist_capacity: '0',
            raw_meeting_text: '',
            raw_status_text: '',
            confidence_notes: '',
            source_images: ['legacy-fall-2024.png']
        });

        await runtime.load('', { seedData: historicalPayload, forceReload: true });
        const preview = runtime.buildSchedulerDraft({
            workspaceId: 'csee',
            academicYear: '2026-27'
        });

        expect(preview.sourceAcademicYear).toBe('2025-26');
        const fallKeys = Object.keys(preview.draft.fall || {});
        const seededRows = fallKeys.flatMap((day) =>
            Object.values(preview.draft.fall[day] || {}).flat()
        );
        expect(seededRows.some((course) => course.code === 'CSCD 999')).toBe(false);
    });
});
