describe('ProgramCommandShell', () => {
    let shell;

    beforeEach(() => {
        jest.resetModules();
        localStorage.clear();
        delete window.ProgramCommandShell;
        shell = require('../js/program-shell.js');
    });

    afterEach(() => {
        localStorage.clear();
        delete window.ProgramCommandShell;
    });

    test('flattens the approved onboarding catalog including education sub-programs', () => {
        const labels = shell.flattenPrograms().map((program) => program.label);

        expect(labels).toHaveLength(12);
        expect(labels).toEqual(expect.arrayContaining([
            'Biology',
            'Chemistry & Biochemistry',
            'Computer Science & Electrical Engineering',
            'Cybersecurity',
            'Design',
            'Science Education',
            'Mathematics Education',
            'Environmental Science',
            'Geosciences',
            'Mathematics',
            'Mechanical Engineering & Technology',
            'Physics'
        ]));
    });

    test('resolves the seeded Design program with its embedded profile id', () => {
        const design = shell.findProgramById('design');

        expect(design).toBeTruthy();
        expect(design.label).toBe('Design');
        expect(design.profileId).toBe('design-v1');
        expect(design.seededDefault).toBe(true);
    });

    test('creates onboarding handoff context with selection and artifact metadata', () => {
        const program = shell.findProgramById('biology');
        const context = shell.createOnboardingContext(program, {
            source: 'spreadsheet',
            artifact: {
                name: 'biology-seed.xlsx',
                size: 2048,
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                capturedAt: '2026-03-26T16:00:00.000Z'
            }
        });

        expect(context).toMatchObject({
            id: 'biology',
            label: 'Biology',
            source: 'spreadsheet',
            baseProfileId: 'design-v1',
            suggestedIdentity: {
                name: 'Biology',
                code: 'BIOL',
                displayName: 'EWU Biology',
                shortName: 'Biology'
            },
            artifact: {
                name: 'biology-seed.xlsx',
                size: 2048,
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                capturedAt: '2026-03-26T16:00:00.000Z'
            }
        });
    });

    test('builds a screenshot batch manifest from nested folder metadata', () => {
        const batch = shell.buildScreenshotArtifactBatch([
            {
                name: 'cscd fall 2025 1.png',
                size: 128,
                type: 'image/png',
                webkitRelativePath: 'cscd-cyber AY2025-26/cscd fall 2025/cscd fall 2025 1.png'
            },
            {
                name: 'cscd winter 2026 2.png',
                size: 256,
                type: 'image/png',
                webkitRelativePath: 'cscd-cyber AY2025-26/cscd winter 2026/cscd winter 2026 2.png'
            },
            {
                name: 'notes.png',
                size: 64,
                type: 'image/png',
                webkitRelativePath: 'cscd-cyber AY2025-26/misc/notes.png'
            },
            {
                name: '.DS_Store',
                size: 32,
                type: '',
                webkitRelativePath: 'cscd-cyber AY2025-26/.DS_Store'
            }
        ], {
            mode: 'directory',
            capturedAt: '2026-03-26T18:30:00.000Z'
        });

        expect(batch).toMatchObject({
            mode: 'directory',
            rootFolderName: 'cscd-cyber AY2025-26',
            count: 3,
            totalSize: 448,
            capturedAt: '2026-03-26T18:30:00.000Z'
        });
        expect(batch.groups).toEqual(expect.arrayContaining([
            expect.objectContaining({ key: 'fall-2025', label: 'Fall 2025', fileCount: 1 }),
            expect.objectContaining({ key: 'winter-2026', label: 'Winter 2026', fileCount: 1 }),
            expect.objectContaining({ key: 'unassigned', label: 'Unassigned', fileCount: 1 })
        ]));
        expect(batch.files[0]).toEqual(expect.objectContaining({
            name: 'cscd fall 2025 1.png',
            relativePath: 'cscd-cyber AY2025-26/cscd fall 2025/cscd fall 2025 1.png',
            term: 'fall',
            year: 2025
        }));
    });

    test('creates screenshot onboarding context with grouped artifact batch metadata', () => {
        const program = shell.findProgramById('cybersecurity');
        const artifactBatch = shell.buildScreenshotArtifactBatch([
            {
                name: 'cyber fall 2025 1.png',
                size: 200,
                type: 'image/png',
                webkitRelativePath: 'cscd-cyber AY2025-26/cyber fall 2025/cyber fall 2025 1.png'
            },
            {
                name: 'cyber spring 2026 1.png',
                size: 220,
                type: 'image/png',
                webkitRelativePath: 'cscd-cyber AY2025-26/cyber spring 2026/cyber spring 2026 1.png'
            }
        ], {
            mode: 'directory'
        });

        const context = shell.createOnboardingContext(program, {
            source: 'screenshot',
            artifactBatch
        });

        expect(context).toMatchObject({
            id: 'cybersecurity',
            label: 'Cybersecurity',
            source: 'screenshot',
            artifactBatch: expect.objectContaining({
                mode: 'directory',
                rootFolderName: 'cscd-cyber AY2025-26',
                count: 2
            })
        });
        expect(context.artifact).toBeNull();
        expect(context.artifactBatch.groups).toEqual(expect.arrayContaining([
            expect.objectContaining({ key: 'fall-2025', label: 'Fall 2025', fileCount: 1 }),
            expect.objectContaining({ key: 'spring-2026', label: 'Spring 2026', fileCount: 1 })
        ]));
    });

    test('detects a previously onboarded custom profile for a non-seeded program', async () => {
        const biology = shell.findProgramById('biology');
        const manager = {
            getStoredProfileId: jest.fn().mockReturnValue('biology-v01'),
            listProfiles: jest.fn().mockResolvedValue({
                profiles: [
                    { id: 'biology-v01', source: 'custom-local', savedAt: '2026-03-26T16:05:00.000Z' }
                ]
            }),
            loadProfile: jest.fn().mockResolvedValue({
                profile: {
                    id: 'biology-v01',
                    identity: {
                        name: 'Biology',
                        code: 'BIOL',
                        shortName: 'Biology'
                    },
                    scheduler: {
                        storageKeyPrefix: 'biolSchedulerData_'
                    },
                    onboardingMeta: {
                        catalogProgramId: 'biology',
                        catalogProgramLabel: 'Biology'
                    }
                }
            })
        };

        const result = await shell.detectProgramData(biology, {
            profileManager: manager,
            isSupabaseConfigured: () => false
        });

        expect(result).toEqual(expect.objectContaining({
            hasData: true,
            profileId: 'biology-v01'
        }));
        expect(manager.loadProfile).toHaveBeenCalledWith('biology-v01');
    });
});
