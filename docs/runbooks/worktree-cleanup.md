# Worktree Cleanup Runbook

This runbook covers the safe first slice of scheduler worktree cleanup.

## Goals

- inventory registered scheduler worktrees and sibling `scheduler-v2-codex*` repo directories
- surface broken worktree metadata in dry-run form before deleting anything
- preserve healthy and active worktrees until they are explicitly triaged

## Commands

Inventory the scheduler-family workspace:

```bash
bash scripts/worktree-inventory.sh
```

Emit machine-readable inventory output:

```bash
bash scripts/worktree-inventory.sh --json
```

Dry-run repair candidates for broken worktree metadata:

```bash
bash scripts/worktree-repair.sh
```

Emit machine-readable repair output:

```bash
bash scripts/worktree-repair.sh --json
```

Only after review, apply the generated repair commands:

```bash
bash scripts/worktree-repair.sh --apply
```

## Environment Overrides

The scripts support local overrides for testing and dry-run review:

- `GITHUB_ROOT`
  Default: `$HOME/Documents/GitHub`
- `WORKTREE_REPO_PREFIX`
  Default: `scheduler-v2-codex`
- `WORKTREE_PRIMARY_REPO_NAME`
  Default: `scheduler-v2-codex`
- `WORKTREE_PORCELAIN_FILE`
  Optional path to a saved `git worktree list --porcelain` fixture
- `WORKTREE_CURRENT_PATH`
  Optional override for the active worktree path

Example:

```bash
GITHUB_ROOT="$HOME/Documents/GitHub" \
WORKTREE_REPO_PREFIX="scheduler-v2-codex" \
bash scripts/worktree-inventory.sh --json
```

## Classification Rules

`scripts/worktree-inventory.sh` emits these classifications:

- `keep`
  Healthy registered worktree with no immediate repair signal
- `repair`
  Broken-but-actionable metadata such as zero-`HEAD` or `prunable`
- `manual-review`
  Locked `initializing` worktrees, the broken primary checkout, and unregistered scheduler-family clone directories

`scripts/worktree-repair.sh` emits these actions:

- `keep`
- `remove-candidate`
- `prune-candidate`
- `manual-review-current`
- `manual-review-locked`
- `manual-review-primary`

## First-Pass Review Checklist

1. Confirm the current active worktree path.
2. Review all `manual-review` and `manual-review-*` entries before applying any removal command.
3. Confirm no `remove-candidate` has unpushed or unmerged work.
4. Confirm unregistered clone directories are archived or intentionally disposable before deleting them.
5. Run the inventory again after cleanup and confirm the broken-entry counts dropped.
