# AGENTS.md

## Autopilot Defaults

Autopilot mode (persistent): Work through repo issues in priority order and do not wait for my supervision. Finish each issue as far as possible (code, tests/checks, commit, push), then move to the next. Make reasonable technical and UX decisions. Only interrupt me for blockers requiring my decision, credentials/access, destructive operations, or ambiguous scope with major consequences.

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
