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

    test('flattens the approved onboarding catalog including department workspaces and education sub-programs', () => {
        const labels = shell.flattenPrograms().map((program) => program.label);

        expect(labels).toHaveLength(15);
        expect(labels).toEqual(expect.arrayContaining([
            'Biology',
            'Chemistry & Biochemistry',
            'Department view',
            'Computer Science + Cybersecurity',
            'Computer Science',
            'Cybersecurity',
            'Electrical Engineering',
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

    test('models the CSEE department with department-wide and combined workspace entries', () => {
        const department = shell.findProgramById('csee-department');
        const combined = shell.findProgramById('computer-science-cybersecurity');

        expect(department).toEqual(expect.objectContaining({
            label: 'Department view',
            departmentId: 'csee',
            departmentLabel: 'Computer Science, Cybersecurity & Electrical Engineering',
            workspaceKind: 'department',
            suggestedCode: 'CSEE'
        }));
        expect(combined).toEqual(expect.objectContaining({
            label: 'Computer Science + Cybersecurity',
            workspaceKind: 'combined-programs',
            memberProgramIds: ['computer-science', 'cybersecurity'],
            suggestedCode: 'CSCY'
        }));
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

    test('creates department-aware onboarding context for combined workspaces', () => {
        const program = shell.findProgramById('computer-science-cybersecurity');
        const context = shell.createOnboardingContext(program, {
            source: 'manual'
        });

        expect(context).toMatchObject({
            id: 'computer-science-cybersecurity',
            label: 'Computer Science + Cybersecurity',
            departmentId: 'csee',
            departmentLabel: 'Computer Science, Cybersecurity & Electrical Engineering',
            workspaceKind: 'combined-programs',
            memberProgramIds: ['computer-science', 'cybersecurity'],
            suggestedIdentity: {
                name: 'Computer Science + Cybersecurity',
                code: 'CSCY',
                displayName: 'EWU Computer Science + Cybersecurity',
                shortName: 'CS + Cyber'
            }
        });
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
