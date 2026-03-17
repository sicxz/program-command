# AGENTS.md

Canonical workflow instructions for AI coding tools in this repository.

This file is the shared source of truth across Codex, Claude Code, and Cursor.
Tool-specific files should add only small compatibility notes and should not
silently diverge from the workflow here.

## Workflow Defaults

- Work through GitHub issues in priority order when the user has not named a different task.
- Default issue flow: implement -> verify -> commit -> push branch -> open or update PR.
- Default integration branch is `develop`; default stable or deploy branch is `main`.
- For live-site hotfixes, recovery work, or explicit user direction, it is acceptable to branch from and PR directly to `main`.
- Create one issue, branch, and worktree per substantial task.
- Fetch from `origin` before starting new work. Treat `origin` as the canonical remote.
- `old-origin` is legacy history only. Do not use it as the base for new work.
- Keep durable decisions in GitHub issues, PR descriptions, or checked-in docs. Do not rely on local chat history, one machine's memory, or tool-specific session state.
- If a workflow rule matters across machines, write it here instead of leaving it in local app settings.

## Autonomy Defaults

- Work end-to-end without waiting for supervision unless blocked.
- Make reasonable technical, UX, and test-scope decisions.
- Only interrupt the user for:
  - credentials, secrets, or missing access
  - destructive operations such as data wipes, force-pushes, or production schema actions
  - ambiguous scope with major product or data-contract consequences
  - repo or CI rules that prevent safe merge or deploy

## Repo-Specific Defaults

- For scheduler triage and UX or data fixes, default the implementation target to `index.html` unless the user explicitly asks for `pages/schedule-builder.html`.
- Prefer Supabase as the source of truth for production runtime data. Treat local JSON and `localStorage` as fallback, bootstrap, cache, or draft layers unless the task explicitly targets them.
- Preserve academic-year scoping. Do not introduce changes that would reinterpret historical schedule data across years.
- When UI behavior and code appear inconsistent, check for stale servers or wrong ports before assuming the code is wrong.
- Keep scheduler action controls visually quiet unless the user asks for louder styling.

## Verification Defaults

- Run the narrowest relevant test suite first.
- For runtime-facing changes, also run `npm run build`.
- For DB contract changes, add or update the SQL migration and add focused regression coverage where practical.
- For UI fixes, verify in a live browser session when feasible and report the exact localhost URL or port validated.

## Tool Alignment

- `CLAUDE.md` supplements project architecture and local development context. If `CLAUDE.md` and `AGENTS.md` conflict on workflow, `AGENTS.md` wins.
- Cursor rules should point back to this file rather than restating large blocks of workflow text.
