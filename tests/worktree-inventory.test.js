const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'worktree-inventory.sh');

function makeRepoDir(root, name) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.git'), 'gitdir: fake\n');
    return dir;
}

function runInventory({ githubRoot, porcelain, currentPath }) {
    const porcelainFile = path.join(githubRoot, 'worktrees.txt');
    fs.writeFileSync(porcelainFile, porcelain);

    const output = execFileSync(
        'bash',
        [SCRIPT, '--json', '--github-root', githubRoot, '--repo-prefix', 'scheduler-v2-codex', '--porcelain-file', porcelainFile],
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

describe('worktree-inventory.sh', () => {
    test('classifies healthy, zero-head, locked, prunable, and unregistered scheduler clones', () => {
        const githubRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-worktree-inventory-'));

        const rootPath = makeRepoDir(githubRoot, 'scheduler-v2-codex');
        const healthyPath = makeRepoDir(githubRoot, 'scheduler-v2-codex-198');
        const lockedPath = makeRepoDir(githubRoot, 'scheduler-v2-codex-98');
        const prunablePath = makeRepoDir(githubRoot, 'scheduler-v2-codex-mainline');
        const clonePath = makeRepoDir(githubRoot, 'scheduler-v2-codexbackup1');

        const porcelain = [
            `worktree ${rootPath}`,
            'HEAD 0000000000000000000000000000000000000000',
            'branch refs/heads/codex/issue-199-recovery',
            '',
            `worktree ${healthyPath}`,
            'HEAD da560701ee5cb8c0f6bfcaf20fc89c5041a55aca',
            'branch refs/heads/codex/198-scheduler-contract',
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

        const result = runInventory({
            githubRoot,
            porcelain,
            currentPath: rootPath
        });

        expect(result.summary.registeredWorktreeCount).toBe(4);
        expect(result.summary.zeroHeadCount).toBe(2);
        expect(result.summary.lockedCount).toBe(1);
        expect(result.summary.prunableCount).toBe(1);
        expect(result.summary.repairCount).toBe(1);
        expect(result.summary.manualReviewCount).toBe(2);
        expect(result.summary.unregisteredCloneCount).toBe(1);

        const rootEntry = result.worktrees.find((entry) => entry.path === rootPath);
        const healthyEntry = result.worktrees.find((entry) => entry.path === healthyPath);
        const lockedEntry = result.worktrees.find((entry) => entry.path === lockedPath);
        const prunableEntry = result.worktrees.find((entry) => entry.path === prunablePath);

        expect(rootEntry.classification).toBe('manual-review');
        expect(rootEntry.reasons).toEqual(expect.arrayContaining(['zero-head', 'primary-checkout', 'current-worktree']));

        expect(healthyEntry.classification).toBe('keep');
        expect(healthyEntry.reasons).toEqual([]);

        expect(lockedEntry.classification).toBe('manual-review');
        expect(lockedEntry.reasons).toEqual(expect.arrayContaining(['zero-head', 'locked-initializing']));

        expect(prunableEntry.classification).toBe('repair');
        expect(prunableEntry.reasons).toEqual(expect.arrayContaining(['prunable']));

        expect(result.unregisteredClones).toEqual([
            expect.objectContaining({
                path: clonePath,
                classification: 'manual-review',
                reasons: ['unregistered-clone']
            })
        ]);
    });
});
