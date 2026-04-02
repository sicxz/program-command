const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'worktree-repair.sh');

function runRepair({ porcelain, currentPath }) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-worktree-repair-'));
    const porcelainFile = path.join(tempRoot, 'worktrees.txt');
    fs.writeFileSync(porcelainFile, porcelain);

    const output = execFileSync(
        'bash',
        [SCRIPT, '--json', '--porcelain-file', porcelainFile],
        {
            cwd: ROOT,
            env: {
                ...process.env,
                WORKTREE_CURRENT_PATH: currentPath
            },
            encoding: 'utf8'
        }
    );

    return JSON.parse(output);
}

describe('worktree-repair.sh', () => {
    test('surfaces dry-run commands while protecting the current broken checkout and locked entries', () => {
        const rootPath = '/Users/test/Documents/GitHub/scheduler-v2-codex';
        const removablePath = '/Users/test/Documents/GitHub/scheduler-v2-codex-211';
        const lockedPath = '/Users/test/Documents/GitHub/scheduler-v2-codex-98';
        const prunablePath = '/Users/test/Documents/GitHub/scheduler-v2-codex-mainline';

        const porcelain = [
            `worktree ${rootPath}`,
            'HEAD 0000000000000000000000000000000000000000',
            'branch refs/heads/codex/issue-199-recovery',
            '',
            `worktree ${removablePath}`,
            'HEAD 0000000000000000000000000000000000000000',
            'branch refs/heads/codex/issue-211',
            '',
            `worktree ${lockedPath}`,
            'HEAD 0000000000000000000000000000000000000000',
            'branch refs/heads/codex/issue-98',
            'locked initializing',
            '',
            `worktree ${prunablePath}`,
            'HEAD a21f2a40ac7d2ef7a7abcf473c294f77847e53ae',
            'branch refs/heads/codex/agent-rules-sync',
            'prunable gitdir file points to non-existent location',
            ''
        ].join('\n');

        const result = runRepair({
            porcelain,
            currentPath: rootPath
        });

        expect(result.apply).toBe(false);
        expect(result.summary.removeCandidateCount).toBe(1);
        expect(result.summary.lockedManualReviewCount).toBe(1);
        expect(result.summary.pruneCandidateCount).toBe(1);
        expect(result.summary.manualReviewCount).toBe(2);

        const currentEntry = result.entries.find((entry) => entry.path === rootPath);
        const removableEntry = result.entries.find((entry) => entry.path === removablePath);
        const lockedEntry = result.entries.find((entry) => entry.path === lockedPath);
        const prunableEntry = result.entries.find((entry) => entry.path === prunablePath);

        expect(currentEntry.action).toBe('manual-review-primary');
        expect(currentEntry.command).toBeNull();
        expect(currentEntry.reasons).toEqual(expect.arrayContaining(['zero-head', 'primary-checkout', 'current-worktree']));

        expect(removableEntry.action).toBe('remove-candidate');
        expect(removableEntry.command).toBe(`git worktree remove --force '${removablePath}'`);

        expect(lockedEntry.action).toBe('manual-review-locked');
        expect(lockedEntry.command).toBeNull();
        expect(lockedEntry.reasons).toEqual(expect.arrayContaining(['zero-head', 'locked-initializing']));

        expect(prunableEntry.action).toBe('prune-candidate');
        expect(prunableEntry.command).toBe('git worktree prune');

        expect(result.commands).toContain(`git worktree remove --force '${removablePath}'`);
        expect(result.commands).toContain('git worktree prune');
    });
});
