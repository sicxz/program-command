const fs = require('fs');
const path = require('path');

function loadScript() {
    const filePath = path.resolve(__dirname, '..', 'scripts', 'supabase-policy-smoke-check.js');
    return fs.readFileSync(filePath, 'utf8');
}

describe('supabase policy smoke check coverage', () => {
    test('verifies programs visibility before write probes', () => {
        const script = loadScript();
        expect(script).toMatch(/from\('programs'\)/i);
        expect(script).toMatch(/anon programs read denied/i);
        expect(script).toMatch(/authorized programs read allowed/i);
        expect(script).toMatch(/eq\('code', 'ewu-design'\)/i);
    });
});
