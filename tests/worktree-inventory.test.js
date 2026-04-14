const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'worktree-inventory.sh');

function makeRepoDir(root, name, extras = []) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.git'), 'gitdir: fake\n');
    extras.forEach((extra, index) => {
        fs.writeFileSync(path.join(dir, `${extra}-${index}.txt`), extra);
    });
    return dir;
}

function runInventory({ githubRoot, gitCommonDir, porcelain, currentPath, branches, prs }) {
    const porcelainFile = path.join(githubRoot, 'worktrees.txt');
    const branchFile = path.join(githubRoot, 'branches.tsv');
    const prFile = path.join(githubRoot, 'open-prs.json');

    fs.writeFileSync(porcelainFile, porcelain);
    fs.writeFileSync(branchFile, branches.join('\n'));
    fs.writeFileSync(prFile, JSON.stringify(prs));

    const output = execFileSync(
        'bash',
        [
            SCRIPT,
            '--json',
            '--github-root',
            githubRoot,
            '--repo-prefix',
            'scheduler-v2-codex',
            '--porcelain-file',
            porcelainFile,
            '--branch-tsv-file',
            branchFile,
            '--pr-json-file',
            prFile
        ],
        {
            cwd: ROOT,
            env: {
                ...process.env,
                WORKTREE_CURRENT_PATH: currentPath,
                WORKTREE_GIT_COMMON_DIR: gitCommonDir
            },
            encoding: 'utf8'
        }
    );

    return JSON.parse(output);
}

describe('worktree-inventory.sh', () => {
    test('classifies registered worktrees, orphan metadata, sibling clones, and branch preservation separately', () => {
        const githubRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-worktree-inventory-'));
        const gitCommonDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-worktree-common-'));
        fs.mkdirSync(path.join(gitCommonDir, 'worktrees'), { recursive: true });
        fs.mkdirSync(path.join(gitCommonDir, 'worktrees', 'orphan-empty'), { recursive: true });

        const rootPath = makeRepoDir(githubRoot, 'scheduler-v2-codex');
        const healthyPath = makeRepoDir(githubRoot, 'scheduler-v2-codex-198');
        const lockedPath = makeRepoDir(githubRoot, 'scheduler-v2-codex-98', ['working-copy']);
        const prunablePath = makeRepoDir(githubRoot, 'scheduler-v2-codex-mainline');
        const clonePath = makeRepoDir(githubRoot, 'scheduler-v2-codexbackup1', ['backup']);

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

        const branches = [
            'develop\torigin/develop\t=\ta4715f5\tMerge pull request #232',
            'codex/198-scheduler-contract\torigin/codex/198-scheduler-contract\t=\t4051577\tfeat: extend issue 98 profile-aware planner surfaces',
            'codex/solo-branch\t\t\tabc1234\tlocal-only branch'
        ];
        const prs = [
            {
                number: 198,
                title: 'Keep the healthy worktree branch',
                headRefName: 'codex/198-scheduler-contract',
                baseRefName: 'develop',
                isDraft: true
            }
        ];

        const result = runInventory({
            githubRoot,
            gitCommonDir,
            porcelain,
            currentPath: rootPath,
            branches,
            prs
        });

        expect(result.summary.registeredWorktreeCount).toBe(4);
        expect(result.summary.brokenRegisteredWorktreeCount).toBe(3);
        expect(result.summary.orphanMetadataCount).toBe(1);
        expect(result.summary.unregisteredCloneCount).toBe(1);
        expect(result.summary.openPrBranchCount).toBe(1);
        expect(result.summary.keepCount).toBe(1);
        expect(result.summary.recoverCount).toBe(1);
        expect(result.summary.archiveCount).toBe(1);
        expect(result.summary.removeCandidateCount).toBe(1);
        expect(result.summary.manualReviewCount).toBe(2);
        expect(result.summary.branchArchiveCount).toBe(1);

        const rootEntry = result.registeredWorktrees.find((entry) => entry.path === rootPath);
        const healthyEntry = result.registeredWorktrees.find((entry) => entry.path === healthyPath);
        const lockedEntry = result.registeredWorktrees.find((entry) => entry.path === lockedPath);
        const prunableEntry = result.registeredWorktrees.find((entry) => entry.path === prunablePath);
        const orphanEntry = result.orphanMetadata[0];
        const cloneEntry = result.unregisteredClones[0];
        const localOnlyBranch = result.branches.find((entry) => entry.branch === 'codex/solo-branch');

        expect(rootEntry.classification).toBe('manual-review');
        expect(rootEntry.reasons).toEqual(expect.arrayContaining(['zero-head', 'current-worktree', 'primary-checkout']));

        expect(healthyEntry.classification).toBe('keep');
        expect(healthyEntry.openPullRequest).toBe(true);

        expect(lockedEntry.classification).toBe('manual-review');
        expect(lockedEntry.reasons).toEqual(expect.arrayContaining(['zero-head', 'locked-initializing', 'nontrivial-working-copy']));

        expect(prunableEntry.classification).toBe('recover');
        expect(prunableEntry.reasons).toEqual(expect.arrayContaining(['prunable']));

        expect(orphanEntry.classification).toBe('remove-candidate');
        expect(orphanEntry.reasons).toEqual(['empty-metadata-dir']);

        expect(cloneEntry.classification).toBe('archive');
        expect(cloneEntry.reasons).toEqual(expect.arrayContaining(['unregistered-clone', 'broken-repo', 'backup-like-name']));

        expect(localOnlyBranch.classification).toBe('archive');
        expect(localOnlyBranch.reasons).toEqual(expect.arrayContaining(['no-upstream']));
    });
});
