const fs = require('fs');
const path = require('path');

function loadRepoFile(...parts) {
    return fs.readFileSync(path.resolve(__dirname, '..', ...parts), 'utf8');
}

function extractProgramConfigEnvelope(sql) {
    const match = sql.match(/SELECT\s+'([\s\S]*?)'\:\:jsonb AS config/i);
    if (!match) {
        throw new Error('Could not locate canonical config envelope in T-07 SQL');
    }
    return JSON.parse(match[1]);
}

describe('T-07 canonical program config seed', () => {
    test('creates programs table and upserts the ewu-design program row', () => {
        const sql = loadRepoFile('scripts', 'supabase-program-config-seed-t07.sql');

        expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.programs/i);
        expect(sql).toMatch(/INSERT INTO public\.programs \(name, code, config\)/i);
        expect(sql).toMatch(/'EWU Design'/i);
        expect(sql).toMatch(/'ewu-design'/i);
        expect(sql).toMatch(/ON CONFLICT \(code\) DO UPDATE/i);
        expect(sql).toMatch(/config = EXCLUDED\.config/i);
    });

    test('keeps the canonical seeded profile in sync with department-profiles/design-v1.json', () => {
        const sql = loadRepoFile('scripts', 'supabase-program-config-seed-t07.sql');
        const seededEnvelope = extractProgramConfigEnvelope(sql);
        const designProfile = JSON.parse(loadRepoFile('department-profiles', 'design-v1.json'));

        expect(seededEnvelope.legacy_department_code).toBe('DESN');
        expect(seededEnvelope.profile_schema_version).toBe(1);
        expect(seededEnvelope.profile_source).toBe('department-profiles/design-v1.json');
        expect(seededEnvelope.profile).toEqual(designProfile);
    });

    test('documentation explains run order and verification for develop setup', () => {
        const doc = loadRepoFile('docs', 'supabase-program-config-seed-t07.md');

        expect(doc).toContain('scripts/supabase-program-config-seed-t07.sql');
        expect(doc).toContain('scripts/supabase-schema.sql');
        expect(doc).toContain('scripts/seed-constraints.sql');
        expect(doc).toContain('scripts/supabase-schedule-sync-rpc.sql');
        expect(doc).toContain("where code = 'ewu-design'");
    });
});
