# AGENTS.md

## Autopilot Defaults

- Always work through GitHub issues in **priority order**, treating `develop` as the integration branch and `main` as the stable/deploy branch.
- For each issue, **implement → run tests/checks → commit → push branch → open/update PR**, then move to the next issue without waiting for supervision unless blocked.
- Default PR base should be **`develop`**; only merge `develop` into `main` after tests and onboarding checks are green and the batch has been sanity‑tested.
- Use the one‑shot autopilot scripts when appropriate: `npm run autopilot:run -- [N]` to prep issue branches/worktrees and `npm run autopilot:finish` to push branches and open PRs.
- When the user describes a clear bug, UX issue, or feature request, **automatically create a GitHub issue** (via `gh issue create`) unless they explicitly say not to; respond with the new issue number and title.
- When the user says things like “log this as an issue” or “file this”, treat that as explicit permission to create the GitHub issue immediately.
- For scheduler triage and UX/data fixes, default the implementation target to the main Program Command surface (`index.html`) unless the user explicitly asks for `pages/schedule-builder.html`.
- For UI fixes, verify in a live browser session (prefer Playwright) before claiming completion, and report the exact localhost URL/port validated.
- When UI behavior and code appear inconsistent, check for multiple running dev servers/ports first; stop stale servers and validate against one fresh server instance.
- Keep scheduler action controls visually quiet: compact sizing, subtle outlines, neutral text emphasis, and minimal icon usage unless the user asks for louder styling.
- Only interrupt the user for: credentials or secret values, destructive operations (e.g., data wipes, production schema changes), ambiguous scope with major product consequences, or when repo/CI rules prevent automated merges.
