const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'pages', 'user-management.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'pages', 'user-management.js'), 'utf8');
const programCommand = fs.readFileSync(path.join(root, 'program-command.html'), 'utf8');

describe('user management page markup', () => {
    test('loads supabase-js, the three shared auth scripts, and public-schedule.css', () => {
        expect(html).toMatch(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2"><\/script>/);
        expect(html).toContain('<script src="../js/supabase-config.js"></script>');
        expect(html).toContain('<script src="../js/auth-service.js"></script>');
        expect(html).toContain('<script src="../js/auth-guard.js"></script>');
        expect(html).toContain('href="../css/public-schedule.css"');
        expect(html).toContain('href="../program-command.html"');
    });

    test('has the invite form, table body, and remove dialog', () => {
        document.body.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, '');
        expect(document.getElementById('inviteForm')).not.toBeNull();
        expect(document.getElementById('inviteEmail')).not.toBeNull();
        expect(document.getElementById('inviteRole')).not.toBeNull();
        expect(document.getElementById('usersTableBody')).not.toBeNull();
        expect(document.getElementById('removeUserDialog')).not.toBeNull();
        expect(html).toContain('Google, Apple, and other social sign-in methods are unavailable.');
    });

    test('calls the admin-users function and holds no secret', () => {
        expect(js).toContain("functions.invoke('admin-users'");
        for (const source of [html, js]) {
            expect(source).not.toMatch(/SERVICE_ROLE|sb_secret/);
        }
    });

    test('program-command.html links to the Users page', () => {
        expect(programCommand).toContain(
            '<a href="pages/user-management.html" class="nav-link"><span class="icon">🔑</span>Users</a>'
        );
    });
});
