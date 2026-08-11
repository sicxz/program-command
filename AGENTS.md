# AGENTS.md

## Autopilot Defaults

Autopilot mode (persistent): Work through repo issues in priority order and do not wait for my supervision. Finish each issue as far as possible (code, tests/checks, commit, push), then move to the next. Make reasonable technical and UX decisions. Only interrupt me for blockers requiring my decision, credentials/access, destructive operations, or ambiguous scope with major consequences.

## Delivery Autonomy

Use milestone-level updates: started, PR ready or blocked, and merged. Do not
request confirmation for routine, in-scope steps. Use parallel agents for
independent research, test analysis, and review; only one agent may edit the
active checkout unless work is isolated in separate worktrees.

For each approved issue or implementation-ready plan, there is standing
authorization to:

- create a short-lived `codex/*` branch;
- edit non-forbidden paths, run relevant checks, commit, and push;
- open a ready pull request against `main`;
- monitor and fix current-head CI failures and address in-scope review
  feedback; and
- squash-merge without another check-in when the focused diff matches the
  approved scope, every required check (including
  `guard-forbidden-paths`) passes on the latest commit, no serious finding or
  actionable review thread remains, and GitHub reports the PR mergeable.

While Travis is the sole human maintainer, an approval-count-only blocker may
be bypassed solely to merge an otherwise merge-ready PR. Never bypass failed
or pending checks, the forbidden-path guard, unresolved feedback, or any other
safety rule. After merging, synchronize local `main`. Do not manually delete
the merged branch; GitHub's configured automatic cleanup may do so.

This is operational authorization only. It does not authorize deployment,
production data or secret changes, ruleset changes, force-pushing, manually
deleting branches, destructive actions, or materially expanding scope. Stop
for those cases or for a consequential product decision.

## Trunk & Safety Rules

These are hard rules, not defaults. The repo is trunk-based on a single `main`.

- **Target `main`.** Open PRs against `main` only. Do not use, push to, or open PRs against `develop`.
- **Short-lived branches.** One focused change per branch/PR. Merged branches are auto-deleted.
- **Never deploy production.** Production publishes only by a human running the manual `Deploy Pages` workflow. Do not trigger `workflow_dispatch` on `deploy-pages.yml` or otherwise publish.
- **Never edit forbidden paths.** Do not add, modify, or delete any of the following — a required CI check (`guard-forbidden-paths`) will fail your PR, and only a human can clear it by applying the `allow-forbidden-paths` label:
  - `.github/workflows/**` — including **creating new workflow files** (no adding a fresh auto-deploy workflow).
  - `ci.yml`
  - `js/supabase-config.js`
  - `.env*`
  - Supabase policy / migration SQL (`*.sql`).
- **Do not touch production Supabase, RLS policies, the editor allowlist, or branch-protection rulesets.** These are human-only controls.

If a task genuinely requires changing a forbidden path, stop and surface it to the maintainer rather than working around the guard.
