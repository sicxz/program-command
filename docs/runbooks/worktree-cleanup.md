# Worktree Recovery Runbook

This runbook executes the safe recovery slice for the scheduler repo without touching product/runtime files.

## Goals

- preserve the dirty root checkout before cleanup
- inventory registered worktrees, orphan metadata, sibling clones, and branch drift in one manifest
- apply only low-risk cleanup actions automatically
- keep `develop` as the clean recovery base and leave `main` report-only

## Operator Entry Points

Inventory the repo recovery state:

```bash
npm run worktree:inventory
```

Write the machine-readable manifest:

```bash
npm run worktree:inventory -- --json
```

Inspect the safe repair plan:

```bash
npm run worktree:repair -- --json
```

Apply only safe repair actions:

```bash
npm run worktree:repair -- --apply
```

Autopilot is blocked until recovery blockers are cleared:

```bash
npm run autopilot:run -- 2
```

## Recommended Recovery Flow

1. Snapshot the dirty root checkout before changing branches or cleaning metadata.

```bash
mkdir -p ../scheduler-v2-codex-recovery-artifacts/2026-04-14-root-snapshot
git status --short --branch > ../scheduler-v2-codex-recovery-artifacts/2026-04-14-root-snapshot/status.txt
git diff --binary > ../scheduler-v2-codex-recovery-artifacts/2026-04-14-root-snapshot/working.diff
git diff --cached --binary > ../scheduler-v2-codex-recovery-artifacts/2026-04-14-root-snapshot/staged.diff
git ls-files -o --exclude-standard > ../scheduler-v2-codex-recovery-artifacts/2026-04-14-root-snapshot/untracked.txt
git stash push --include-untracked -m "repo-recovery-root-snapshot-2026-04-14"
```

2. Move the cleanup lane into a clean `develop`-based worktree/branch.

The repo-specific worktree manager can be used for this step; the important outcome is a fresh branch that contains only operational cleanup changes.

3. Capture live recovery artifacts from the clean recovery worktree.

```bash
mkdir -p ../scheduler-v2-codex-recovery-artifacts/2026-04-14-repo-recovery
npm run worktree:inventory -- --json > ../scheduler-v2-codex-recovery-artifacts/2026-04-14-repo-recovery/inventory.json
npm run worktree:repair -- --json > ../scheduler-v2-codex-recovery-artifacts/2026-04-14-repo-recovery/repair-plan.json
git rev-list --left-right --count origin/main...main > ../scheduler-v2-codex-recovery-artifacts/2026-04-14-repo-recovery/main-divergence.txt
git log --left-right --cherry-pick --oneline origin/main...main > ../scheduler-v2-codex-recovery-artifacts/2026-04-14-repo-recovery/main-reachability.txt
gh pr list --state open --limit 100 --json number,title,headRefName,baseRefName,isDraft > ../scheduler-v2-codex-recovery-artifacts/2026-04-14-repo-recovery/open-prs.json
```

4. Apply only the safe repair wave.

```bash
npm run worktree:repair -- --apply
```

5. Re-run the manifest and confirm only the manual-review queue remains.

```bash
npm run worktree:inventory -- --json > ../scheduler-v2-codex-recovery-artifacts/2026-04-14-repo-recovery/post-apply-inventory.json
```

## Classification Rules

Operational items use only these classifications:

- `keep`
  - active registered worktrees and other items that should stay in place
- `recover`
  - broken-but-repairable metadata such as prunable worktrees or partial orphan metadata
- `archive`
  - sibling clones that should be preserved outside active workspaces before deletion
- `remove-candidate`
  - low-risk items safe to remove automatically, such as empty orphan metadata directories
- `manual-review`
  - anything with meaningful filesystem contents, open PR ties, the primary checkout, or unresolved ambiguity

Branch preservation is reported separately from operational recovery blockers so autopilot only blocks on repo-health issues, not every stale branch.

## Current Manual-Review Queue

As of the 2026-04-14 recovery pass, expect these categories to remain manual-review until explicitly triaged:

- the dirty root lane on `codex/issue-199-recovery`
- broken registered worktrees with full working copies such as `scheduler-v2-codex-issue-231` and `scheduler-v2-codex-main-test`
- unregistered sibling clones that need archival or reachability review before deletion
- local `main`, which is report-only in this pass

## PR Lane Split

Do not continue from draft PR `#241` directly. Use it only as salvage input for:

- `docs/plans/scheduler-worktree-repo-cleanup-plan.md`
- `docs/runbooks/worktree-cleanup.md`
- `scripts/autopilot-worktree-paths.sh`
- `scripts/worktree-inventory.sh`
- `scripts/worktree-repair.sh`
- `tests/worktree-inventory.test.js`
- `tests/worktree-repair.test.js`

Keep runtime/catalog/data changes out of the cleanup branch and out of the superseding cleanup PR.
