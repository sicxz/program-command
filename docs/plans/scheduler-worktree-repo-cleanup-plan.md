---
title: Scheduler Worktree And Repo Cleanup Plan
status: active
created: 2026-04-02
updated: 2026-04-02
depth: deep
owner: codex
---

# Scheduler Worktree And Repo Cleanup Plan

## Problem Frame

The local scheduler workspace has accumulated a large amount of Git sprawl across registered worktrees, sibling repo directories, and broken leftovers from prior Codex/autopilot runs. The current state is risky for everyday work because it mixes healthy worktrees with invalid `HEAD` entries, locked `initializing` entries, a prunable worktree, and full clone directories that are not registered as Git worktrees at all.

Current observed state in this repo:

- 41 registered worktrees
- 12 worktrees with zero `HEAD`
- 2 locked `initializing` worktrees
- 1 prunable worktree entry
- 35 `scheduler-v2-codex*` repo directories in the local GitHub workspace root
- 3 scheduler-family repo directories that are not registered as worktrees: `scheduler-v2-codex-98-merge-clone`, `scheduler-v2-codex-mainline-broken`, and `scheduler-v2-codexbackup1`
- the primary `scheduler-v2-codex` checkout itself is currently attached to `codex/issue-199-recovery` with an invalid zero `HEAD`

This plan is for a safe, staged cleanup of the scheduler family only: the main repo, its registered worktrees, Codex-managed `.codex/worktrees/*` entries, and sibling `scheduler-v2-codex*` directories. It does not try to clean every unrelated repo in the broader GitHub workspace root during the first pass.

## Scope

In scope:

- Registered worktrees for this repository, including direct sibling directories and Codex-managed worktrees under `.codex/worktrees/`
- Broken worktree metadata (`zero HEAD`, `locked initializing`, `prunable`)
- Sibling `scheduler-v2-codex*` clone directories that are not registered as worktrees
- Branch/worktree preservation rules, cleanup sequencing, and recurrence prevention for future autopilot/Codex work

Out of scope:

- Destructive cleanup of unrelated repos outside the scheduler family
- Rewriting Git history
- Force-deleting branches without first checking push state and PR state
- Automatic destructive cleanup of potentially dirty worktrees in the first execution slice

## Requirements Trace

1. Cleanup must not destroy unmerged or unpushed work without explicit review.
2. Registered Git worktrees and stray full clones must be classified separately because they require different cleanup commands.
3. Broken metadata should be repaired before any broad directory deletion.
4. The current primary checkout must be stabilized before other work continues.
5. Cleanup should be repeatable and auditable, not a one-off manual scramble.
6. The plan should reduce recurrence by tightening worktree lifecycle practices in the repo.

## Assumptions

- First-pass cleanup targets the scheduler family only, not all 62 repos in the local GitHub workspace root.
- Any branch with an open PR, a meaningful recent change, or unpushed commits is preserved until explicitly triaged.
- The cleanup execution will use dry-run or inventory output before any destructive remove step.
- Some of the zero-`HEAD` worktrees are abandoned setup attempts and can be safely removed after verifying they have no unique filesystem-only work.

## Research Summary

Relevant local patterns and evidence:

- `scripts/autopilot-worktree-paths.sh` already parses `git worktree list --porcelain` into a branch-to-path map and is the best existing repo-native pattern for worktree inventory tooling.
- `git worktree list --porcelain` in the current checkout exposes the exact broken states we need to classify: zero `HEAD`, `locked initializing`, and `prunable`.
- `git branch -vv` shows a mixed branch landscape: some branches track active remotes/PRs, some are ahead/behind, and some have no upstream configured at all.
- The scheduler-family directories are a combination of registered worktrees and separate full clones, so path-based cleanup alone would be unsafe.

Observed scheduler-family mismatches:

- Registered GitHub-root worktree directories cover most `scheduler-v2-codex-*` directories.
- `scheduler-v2-codex-98-merge-clone`, `scheduler-v2-codex-mainline-broken`, and `scheduler-v2-codexbackup1` are sibling clones not tracked as worktrees.

External research decision:

- Skip external research. This is local Git hygiene and repo-specific operational planning. The needed guidance is already available from the repo’s current scripts and the live Git metadata.

## Technical Decisions

1. Treat cleanup as a two-layer problem: Git metadata first, filesystem second.
   Registered worktrees should be removed or repaired through `git worktree` operations before deleting directories. Stray full clones should be handled only after they are proven not to be active worktrees.

2. Add inventory tooling before destructive cleanup.
   A structured inventory report should classify each scheduler-family directory and worktree as `keep`, `repair`, `remove`, or `manual-review`. This avoids relying on ad hoc terminal output during execution.

3. Stabilize the primary checkout before batch cleanup.
   The root `scheduler-v2-codex` checkout is currently broken, so execution should first move daily work to a healthy branch/worktree or repair the current checkout before broader cleanup.

4. Separate cleanup into confidence tiers.
   Tier 1: zero-`HEAD` unlocked worktrees and prunable metadata
   Tier 2: locked `initializing` worktrees after explicit verification
   Tier 3: healthy but stale worktrees based on branch upstream state
   Tier 4: stray non-worktree clones

5. Prevent recurrence with repo-native guardrails, not memory.
   The repo should gain a small inventory/cleanup helper and documented rules for when to create, rename, finish, prune, and delete worktrees.

## Recommended First Execution Slice

Start with inventory tooling and the dry-run half of repair:

- add inventory tooling
- generate a preservation manifest from the current workspace
- surface exact repair/remove candidates without deleting anything yet

That slice gives us the decision artifact needed for the actual cleanup pass and sharply reduces the risk of deleting the wrong workspace.
