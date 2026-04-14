---
title: Scheduler Worktree And Repo Cleanup Plan
status: active
created: 2026-04-02
updated: 2026-04-14
depth: deep
owner: codex
---

# Scheduler Worktree And Repo Cleanup Plan

## Problem Frame

The scheduler repo is no longer just a worktree-cleanup problem. As of 2026-04-13, the live repo state combines three kinds of drift that now block normal work:

- local Git sprawl across registered worktrees, orphan `.git/worktrees/*` metadata, and sibling `scheduler-v2-codex*` clone directories
- branch and PR drift, including a dirty root checkout on `codex/issue-199-recovery`, `develop` previously lagging `origin/develop`, and `main` both ahead of and behind `origin/main`
- workflow drift, where `AGENTS.md` assumes autopilot scripts and recovery guardrails that are not actually present on `develop`

Observed baseline for this recovery pass:

- the root checkout is the active daily workspace and must be preserved before any cleanup
- 15 registered worktrees exist, with 2 broken registered worktrees: `scheduler-v2-codex-issue-231` and `scheduler-v2-codex-main-test`
- 14 orphan metadata directories exist under `.git/worktrees/`
- 8 unregistered sibling `scheduler-v2-codex*` directories exist outside registered worktrees
- issue `#240` is the active cleanup issue
- draft PR `#241` mixes cleanup tooling with unrelated product changes and cannot be used as-is

This plan refreshes the original April 2 cleanup effort so the repo can recover to one intentional primary checkout, a smaller and auditable worktree set, and a `develop`-first flow that does not touch product behavior.

## Scope Boundaries

In scope:

- `docs/plans/scheduler-worktree-repo-cleanup-plan.md`
- `docs/runbooks/worktree-cleanup.md`
- `scripts/autopilot-worktree-paths.sh`
- `scripts/autopilot-run.sh`
- `scripts/autopilot-finish.sh`
- `scripts/worktree-inventory.sh`
- `scripts/worktree-repair.sh`
- `tests/worktree-inventory.test.js`
- `tests/worktree-repair.test.js`
- `package.json`
- safe live recovery actions driven by the new manifest and repair tooling

Out of scope:

- changing runtime or UI files such as `index.html`, `js/**/*`, `pages/**/*`, or catalog/data files
- force-pushing, rewriting history, or otherwise mutating `main`
- deleting any branch, clone, or worktree that still needs manual review
- treating the mixed PR `#241` as the final recovery PR

## Requirements Trace

1. Preserve all potentially valuable local work before cleanup mutates Git metadata or directories.
2. Inventory must cover registered worktrees, orphan `.git/worktrees/*` metadata, sibling clones, open PR branches, and local branches with no upstream or local-only commits.
3. Broken registered worktrees with real filesystem contents must be escalated to manual review instead of being auto-removed.
4. Empty orphan metadata directories should become safe `remove-candidate` items so low-risk cleanup can proceed automatically.
5. `develop` should be realigned with `origin/develop` as part of the recovery baseline, while `main` remains a reported/manual-review branch.
6. Autopilot entrypoints must fail fast when the recovery manifest still reports broken metadata or too many registered worktrees.
7. The recovery lane must supersede the cleanup portion of PR `#241` without pulling unrelated product changes into the cleanup branch.

## Key Decisions

1. Recovery is manifest-first, not delete-first.
   `scripts/worktree-inventory.sh` becomes the source of truth for preservation decisions across worktrees, orphan metadata, sibling clones, and local branches.

2. Classification vocabulary stays small and explicit.
   Every operational item is labeled as `keep`, `recover`, `archive`, `remove-candidate`, or `manual-review`.

3. Registered broken worktrees are only auto-removable when they are trivial.
   A zero-`HEAD` worktree with a meaningful filesystem tree is treated as `manual-review`; only trivial broken entries become `remove-candidate`.

4. Orphan metadata is cleaned before risky directory removal.
   Empty `.git/worktrees/*` entries are the first safe cleanup wave because they do not contain user work and are easy to re-measure after removal.

5. The cleanup lane is split from the mixed PR.
   Only operational files are salvaged into a fresh `develop`-based branch. Unrelated runtime/catalog commits remain outside the cleanup PR.

6. Autopilot must respect recovery state.
   `scripts/autopilot-run.sh` checks inventory before creating more worktrees and refuses to proceed while recovery blockers remain.

## Implementation Units

### IU1. Preservation Manifest And Branch Report

Goal:

- Build a recovery manifest that captures the actual repo state instead of only parsing `git worktree list --porcelain`.

Files:

- `scripts/worktree-inventory.sh`
- `tests/worktree-inventory.test.js`
- `docs/runbooks/worktree-cleanup.md`

Approach:

- Parse registered worktrees from porcelain output.
- Inspect `.git/worktrees/*` via the repo common Git dir and classify orphan metadata separately from registered worktrees.
- Inventory sibling `scheduler-v2-codex*` directories under the GitHub workspace root and default them to archival preservation unless they are active/open-PR items.
- Inventory local branches, open PR branches, and base-branch divergence for `develop` and `main`.
- Emit both human-readable and JSON output so the manifest can be saved as a recovery artifact.

Verification:

- The manifest reproduces the current repo counts and surfaces the dirty root checkout, broken registered worktrees, orphan metadata, unregistered clones, and branch drift in one report.

### IU2. Safe Repair Surface

Goal:

- Convert the manifest into low-risk repair actions without deleting anything that still needs manual review.

Files:

- `scripts/worktree-repair.sh`
- `tests/worktree-repair.test.js`
- `docs/runbooks/worktree-cleanup.md`

Approach:

- Turn empty orphan metadata into `remove-candidate` entries with `rmdir`.
- Turn prunable worktree states into `recover` entries with `git worktree prune`.
- Only emit `git worktree remove --force` for trivial zero-`HEAD` worktrees with no meaningful filesystem tree.
- Escalate broken full clones and the primary/current checkout to `manual-review`.
- Keep apply mode opt-in so the default remains dry-run.

Verification:

- Dry-run output distinguishes safe commands from manual-review items, and apply mode only executes the safe command set.

### IU3. Guardrails For Future Worktree Creation

Goal:

- Align repo automation with `AGENTS.md` so new work is blocked until recovery debt is back under control.

Files:

- `scripts/autopilot-run.sh`
- `scripts/autopilot-finish.sh`
- `scripts/autopilot-worktree-paths.sh`
- `package.json`
- `tests/worktree-repair.test.js`

Approach:

- Add the missing npm entrypoints for autopilot and recovery tooling.
- Make `scripts/autopilot-run.sh` load the inventory JSON and fail when recovery blockers or too many live worktrees remain.
- Keep `.autopilot-batch.txt` on the current `issue<TAB>branch<TAB>path` contract.
- Keep `scripts/autopilot-worktree-paths.sh` as the branch-to-path source of truth.

Verification:

- Autopilot exits with a clear recovery message when the manifest reports `recover` or `manual-review` items.

### IU4. Live Recovery Application

Goal:

- Apply the safe portion of the recovery plan to the live repo and capture durable artifacts for the remaining manual-review work.

Files:

- `docs/runbooks/worktree-cleanup.md`

Approach:

- Snapshot the dirty root checkout before any repo mutation.
- Create a clean `develop`-based recovery worktree/branch for the operational changes.
- Save manifest and repair outputs outside the repo for handoff/reference.
- Apply only the safe cleanup wave from `scripts/worktree-repair.sh`.
- Capture a `main` reachability report without mutating `main`.

Verification:

- Recovery artifacts exist, the root WIP is preserved, and low-risk cleanup reduces orphan metadata without touching manual-review items.

## Test Plan

- `tests/worktree-inventory.test.js`
  - registered worktrees are classified into `keep`, `recover`, or `manual-review`
  - empty orphan metadata directories are `remove-candidate`
  - unregistered sibling clones default to `archive`
  - local-only branches are surfaced separately from operational recovery blockers
- `tests/worktree-repair.test.js`
  - trivial zero-`HEAD` worktrees become `remove-candidate`
  - nontrivial or current broken worktrees remain `manual-review`
  - prunable entries emit `git worktree prune`
  - empty orphan metadata emits `rmdir`
  - autopilot refuses to create more worktrees when the inventory summary reports recovery blockers
- Live validation
  - `bash scripts/worktree-inventory.sh --json`
  - `bash scripts/worktree-repair.sh --json`
  - `bash scripts/worktree-repair.sh --apply`

## Assumptions

- The root `codex/issue-199-recovery` work is preserved via snapshot/stash before the cleanup lane proceeds.
- `develop` is the integration base; a recovery branch/worktree off `develop` is the correct superseding lane for cleanup work.
- `main` stays report-only in this pass: divergence is captured, not rewritten.
- PR `#241` is treated as cleanup research/input, not the branch to continue from directly.
