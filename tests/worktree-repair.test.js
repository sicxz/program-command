const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const REPAIR_SCRIPT = path.join(ROOT, 'scripts', 'worktree-repair.sh');
const AUTOPILOT_SCRIPT = path.join(ROOT, 'scripts', 'autopilot-run.sh');

function makeRepoDir(root, name, extras = []) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.git'), 'gitdir: fake\n');
    extras.forEach((extra, index) => {
        fs.writeFileSync(path.join(dir, `${extra}-${index}.txt`), extra);
    });
    return dir;
}

function runRepair({ githubRoot, gitCommonDir, porcelain, currentPath, branches, prs }) {
    const porcelainFile = path.join(githubRoot, 'worktrees.txt');
    const branchFile = path.join(githubRoot, 'branches.tsv');
    const prFile = path.join(githubRoot, 'open-prs.json');

    fs.writeFileSync(porcelainFile, porcelain);
    fs.writeFileSync(branchFile, branches.join('\n'));
    fs.writeFileSync(prFile, JSON.stringify(prs));

    const output = execFileSync(
        'bash',
        [
            REPAIR_SCRIPT,
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

describe('worktree-repair.sh', () => {
    test('keeps current and nontrivial broken worktrees in manual review while surfacing only safe commands', () => {
        const githubRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-worktree-repair-'));
        const gitCommonDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-worktree-repair-common-'));
        fs.mkdirSync(path.join(gitCommonDir, 'worktrees', 'orphan-empty'), { recursive: true });

        const rootPath = makeRepoDir(githubRoot, 'scheduler-v2-codex');
        const removablePath = makeRepoDir(githubRoot, 'scheduler-v2-codex-211');
        const lockedPath = makeRepoDir(githubRoot, 'scheduler-v2-codex-98', ['working-copy']);
        const prunablePath = makeRepoDir(githubRoot, 'scheduler-v2-codex-mainline');

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

        const branches = [
            'develop\torigin/develop\t=\ta4715f5\tMerge pull request #232',
            'codex/issue-211\t\t\tabc1111\tworktree candidate'
        ];

        const result = runRepair({
            githubRoot,
            gitCommonDir,
            porcelain,
            currentPath: rootPath,
            branches,
            prs: []
        });

        expect(result.apply).toBe(false);
        expect(result.summary.recoverCount).toBe(1);
        expect(result.summary.removeCandidateCount).toBe(2);
        expect(result.summary.manualReviewCount).toBe(2);

        const currentEntry = result.entries.find((entry) => entry.path === rootPath);
        const removableEntry = result.entries.find((entry) => entry.path === removablePath);
        const lockedEntry = result.entries.find((entry) => entry.path === lockedPath);
        const prunableEntry = result.entries.find((entry) => entry.path === prunablePath);
        const orphanEntry = result.entries.find((entry) => entry.kind === 'orphan-metadata');

        expect(currentEntry.classification).toBe('manual-review');
        expect(currentEntry.command).toBeNull();

        expect(removableEntry.classification).toBe('remove-candidate');
        expect(removableEntry.command).toBe(`git worktree remove --force ${removablePath}`);

        expect(lockedEntry.classification).toBe('manual-review');
        expect(lockedEntry.command).toBeNull();

        expect(prunableEntry.classification).toBe('recover');
        expect(prunableEntry.command).toBe('git worktree prune');

        expect(orphanEntry.classification).toBe('remove-candidate');
        expect(orphanEntry.command).toContain('rmdir');

        expect(result.commands).toEqual(
            expect.arrayContaining([
                `git worktree remove --force ${removablePath}`,
                'git worktree prune',
                expect.stringContaining('rmdir')
            ])
        );
    });

    test('autopilot-run refuses to create more worktrees while recovery blockers remain', () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-autopilot-guard-'));
        const inventoryFile = path.join(tempRoot, 'inventory.json');

        fs.writeFileSync(
            inventoryFile,
            JSON.stringify({
                summary: {
                    recoverCount: 1,
                    manualReviewCount: 2,
                    registeredWorktreeCount: 15
                }
            })
        );

        try {
            execFileSync('bash', [AUTOPILOT_SCRIPT, '2'], {
                cwd: ROOT,
                env: {
                    ...process.env,
                    AUTOPILOT_INVENTORY_JSON_FILE: inventoryFile
                },
                encoding: 'utf8',
                stdio: 'pipe'
            });
            throw new Error('Expected autopilot guardrail to fail');
        } catch (error) {
            expect(error.stderr || error.message).toMatch(/autopilot blocked/i);
        }
    });
});
