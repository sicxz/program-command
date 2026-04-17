describe('supabase runtime context resolution', () => {
    function loadConfig() {
        jest.resetModules();
        return require('../js/supabase-config.js');
    }

    beforeEach(() => {
        window.localStorage.clear();
        delete window.ProgramCommandShell;
        delete global.__PROGRAM_COMMAND_ACTIVE_PROFILE__;
        delete window.activeDepartmentProfile;
    });

    test('prefers active profile identity when present', () => {
        global.__PROGRAM_COMMAND_ACTIVE_PROFILE__ = {
            id: 'engineering-v1',
            identity: {
                code: 'ENGR',
                name: 'Engineering',
                displayName: 'EWU Engineering'
            }
        };

        const config = loadConfig();
        expect(config.getActiveDepartmentIdentity()).toEqual({
            code: 'ENGR',
            name: 'Engineering',
            displayName: 'EWU Engineering'
        });
        expect(config.getProgramCommandRuntimeContext().source).toBe('active-profile');
        expect(config.getProgramCommandRuntimeContext().programCodeCandidates).not.toContain('engineering-v1');
    });

    test('uses shell selection before falling back to design bootstrap', () => {
        window.ProgramCommandShell = {
            readSelection: jest.fn(() => ({
                id: 'computer-science',
                label: 'Computer Science',
                suggestedCode: 'CSCD',
                identityName: 'Computer Science',
                identityDisplayName: 'EWU Computer Science'
            }))
        };

        const config = loadConfig();
        expect(config.getActiveDepartmentIdentity()).toEqual({
            code: 'CSCD',
            name: 'Computer Science',
            displayName: 'EWU Computer Science'
        });
        expect(config.getProgramCommandRuntimeContext().programCodeCandidates).toContain('computer-science');
    });

    test('uses onboarding context when no active profile or shell selection exists', () => {
        window.localStorage.setItem('programCommandOnboardingContextV1', JSON.stringify({
            id: 'electrical-engineering',
            label: 'Electrical Engineering',
            suggestedIdentity: {
                code: 'EE',
                name: 'Electrical Engineering',
                displayName: 'EWU Electrical Engineering'
            }
        }));

        const config = loadConfig();
        expect(config.getProgramCommandRuntimeContext().source).toBe('onboarding-context');
        expect(config.getActiveDepartmentIdentity()).toEqual({
            code: 'EE',
            name: 'Electrical Engineering',
            displayName: 'EWU Electrical Engineering'
        });
    });
});
