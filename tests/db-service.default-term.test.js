const dbService = require('../js/db-service.js');

describe('dbService.getDefaultTerm', () => {
    afterEach(() => {
        delete global.getSupabaseClient;
        jest.restoreAllMocks();
    });

    test('maps the public current term RPC row', async () => {
        const rpc = jest.fn().mockResolvedValue({
            data: [{ academic_year: '2026-27', quarter: 'FALL' }],
            error: null
        });
        global.getSupabaseClient = jest.fn(() => ({ rpc }));

        await expect(dbService.getDefaultTerm()).resolves.toEqual({
            academicYear: '2026-27', quarter: 'fall'
        });
        expect(rpc).toHaveBeenCalledWith('get_public_current_term', {
            p_program_code: 'ewu-design'
        });
    });

    test('passes a custom program code to the read RPC', async () => {
        const rpc = jest.fn().mockResolvedValue({
            data: { academic_year: '2027-28', quarter: 'winter' },
            error: null
        });
        global.getSupabaseClient = jest.fn(() => ({ rpc }));

        await expect(dbService.getDefaultTerm('another-program')).resolves.toEqual({
            academicYear: '2027-28', quarter: 'winter'
        });
        expect(rpc).toHaveBeenCalledWith('get_public_current_term', {
            p_program_code: 'another-program'
        });
    });

    test('returns null on an RPC error or empty result', async () => {
        const rpc = jest.fn()
            .mockResolvedValueOnce({ data: null, error: { message: 'unavailable' } })
            .mockResolvedValueOnce({ data: [], error: null })
            .mockRejectedValueOnce(new Error('network failure'));
        global.getSupabaseClient = jest.fn(() => ({ rpc }));

        await expect(dbService.getDefaultTerm()).resolves.toBeNull();
        await expect(dbService.getDefaultTerm()).resolves.toBeNull();
        await expect(dbService.getDefaultTerm()).resolves.toBeNull();
    });


    test('returns null within the timeout when the RPC never resolves', async () => {
        const rpc = jest.fn(() => new Promise(() => {}));
        global.getSupabaseClient = jest.fn(() => ({ rpc }));
        const started = Date.now();
        const result = await dbService.getDefaultTerm('ewu-design', { timeoutMs: 25 });
        expect(result).toBeNull();
        expect(Date.now() - started).toBeLessThan(2000);
        expect(rpc).toHaveBeenCalledTimes(1);
    });
});
