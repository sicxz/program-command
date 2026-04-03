# Scheduler Worktree Cleanup Handoff - April 2, 2026

## Current status
- Branch used for work: `codex/worktree-cleanup-tooling`
- Draft PR: `#241`
- Cleanup execution was performed from a healthy worktree because the primary checkout is broken.

## What was changed in this pass
- Added repeatable cleanup tooling:
  - `scripts/autopilot-worktree-paths.sh`
  - `scripts/worktree-inventory.sh`
  - `scripts/worktree-repair.sh`
- Added a runbook at `docs/runbooks/worktree-cleanup.md`.
- Added focused Jest coverage for inventory and repair classification behavior.
- Protected the primary `scheduler-v2-codex` checkout from accidental removal even when it reports zero `HEAD`.
- Executed the first safe cleanup wave against the live scheduler workspace.

## Live cleanup result
- Registered worktrees: `41 -> 29`
- Zero-`HEAD` entries: `12 -> 1`
- Locked entries: `2 -> 0`
- Prunable entries: `1 -> 0`
- Unregistered scheduler-family clones: `3 -> 1`

## What was preserved instead of deleted
- Preserved moved worktrees/clones now live under:
  - `/Users/tmasingale/Documents/GitHub/.scheduler-preserved-worktrees/20260402-151307`
- Preserved entries include:
  - `scheduler-v2-codex-211`
  - `scheduler-v2-codex-213`
  - `scheduler-v2-codex-213-programs`
  - `scheduler-v2-codex-213c`
  - `scheduler-v2-codex-223`
  - `scheduler-v2-codex-224`
  - `scheduler-v2-codex-226`
  - `scheduler-v2-codex-228c`
  - `scheduler-v2-codex-98`
  - `scheduler-v2-codex-98-merge`
  - `scheduler-v2-codex-98-merge-clone`
  - `scheduler-v2-codex-98-pr`
  - `scheduler-v2-codex-mainline-broken`

## Remaining manual-review items
- Primary broken checkout:
  - `/Users/tmasingale/Documents/GitHub/scheduler-v2-codex`
  - Still registered with zero `HEAD`
  - Intentionally left in place for explicit recovery or retirement
- Dirty backup clone:
  - `/Users/tmasingale/Documents/GitHub/scheduler-v2-codexbackup1`
  - Still unregistered
  - Has local modifications and should not be auto-deleted

## Validation run (completed)
- `bash -n scripts/autopilot-worktree-paths.sh scripts/worktree-inventory.sh scripts/worktree-repair.sh`
- `npm test -- tests/worktree-inventory.test.js tests/worktree-repair.test.js`

## Recommended next move
- Recover or retire the broken primary checkout at `/Users/tmasingale/Documents/GitHub/scheduler-v2-codex`
- Triage `scheduler-v2-codexbackup1` to decide whether it should be merged, archived, or kept as a deliberate backup
- Re-run `bash scripts/worktree-inventory.sh --json` after any manual-review action to confirm the workspace is fully normalized
