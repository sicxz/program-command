# Progress Handoff — 2026-05-29

## What this branch is

`wip/codex-readiness-tests` is a **parking branch**, not a feature branch. On
2026-05-29 the working tree had accumulated three unrelated bodies of change
mixed together on `feat/header-stats-polish` (which has an open, focused UI PR,
#261). This branch quarantines the **unfinished Codex production-readiness
work** so it is saved in version control without polluting PR #261 or breaking
CI.

> **Do NOT merge this branch as-is.** 17 of its test suites are red (see below).
> Merging would block the deploy gate — `deploy-pages.yml` refuses to publish
> unless the `test` check is green.

## How the untangle was done

| Bucket | Where it went | Status |
|---|---|---|
| `.gitignore` for agent tooling + `CLAUDE.md` two-model-stack doc | branch `chore/tooling-gitignore-two-model-doc` → **PR #262** to `main` | Clean, mergeable |
| Agent tooling / local scratch (`.codex/`, `.context/`, `.cursor/`, `.playwright-mcp/`, `header-check.png`, `TRAVIS.md`) | now gitignored (see PR #262) | Not committed, by design |
| Unfinished Codex readiness work (this branch) | `wip/codex-readiness-tests` → draft PR | **17 suites red** — parked |
| Header/stats UI polish | `feat/header-stats-polish` → PR #261 | Untouched, left clean at `93d1563` |

## What's parked on this branch

- `js/program-shell.js` — new program-shell module. **Not yet wired into any
  HTML** (no `<script src>` references it). Its test is green (see below).
- `docs/plans/2026-05-12-001-refactor-public-schedule-hardening-plan.md`
- `docs/progress-handoff-2026-05-27.md`
- 19 `tests/*.test.js` files.

### Test status of the parked tests

**Already green (2)** — could be promoted to `main` quickly on their own:

- `tests/program-shell.test.js` (covers `js/program-shell.js`)
- `tests/schedule-modules.direct-data.test.js`

**Red (17)** — all fail for the same reason: they assert against audit docs and
a runtime-dependency script that were **never created**. The tests are the only
half of the work that landed.

Missing files the red tests expect:

```
scripts/audit-runtime-dependencies.js
docs/audits/README.md
docs/audits/dashboard-shell-baseline.md
docs/audits/data-truth-audit.md
docs/audits/multi-department-blockers.md
docs/audits/multi-department-release-gate.md
docs/audits/operational-confidence-audit.md
docs/audits/platformization-audit.md
docs/audits/product-consistency-audit.md
docs/audits/production-readiness-program.md
docs/audits/production-source-of-truth-policy.md
```

Red suites:
`audit-runtime-dependencies`, `constraints-dashboard.canonical-data`,
`constraints-engine.runtime-rules`, `course-management.intent`,
`data-truth-audit-doc`, `db-service.academic-year-read`,
`db-service.department-scoping`, `db-service.source-status`,
`multi-department-release-gate-doc`, `platformization-audit-doc`,
`product-consistency-audit-doc`, `production-readiness-program-doc`,
`release-time-manager.profile-scope`, `schedule-builder.database-baseline`,
`schedule-builder.runtime-rules`, `schedule-builder.runtime-source-banner`,
`validators.generic-course-code`.

## Next steps

1. **Land the easy wins first.** Cherry-pick `tests/program-shell.test.js`,
   `js/program-shell.js`, and `tests/schedule-modules.direct-data.test.js` onto
   a small branch → PR to `main`. They are green today. (If you want
   `program-shell.js` actually used, also wire it into the relevant page's
   `<script>` tags — currently it's dead code.)
2. **Decide the fate of the red 17.** Either:
   - **Finish the work:** locate the original Codex source for
     `scripts/audit-runtime-dependencies.js` and the `docs/audits/*` set (check
     branch `codex/production-readiness-audit` — `TRAVIS.md`, now gitignored,
     pointed there), bring it onto a feature branch alongside these tests, and
     get the suite green before any PR to `main`; **or**
   - **Drop the tests:** if the readiness-audit direction is abandoned, delete
     these 17 test files rather than carrying red tests indefinitely.
3. **Merge PR #262** (chore) whenever convenient — it's independent and safe.
4. **Keep PR #261 moving** — it's a clean UI change and unaffected by any of the above.

## Verification at handoff time

- `feat/header-stats-polish` HEAD: `93d1563` (unchanged; PR #261 untouched).
- Full suite on `main` + parked files: 40 passed suites, 17 failed (the parked
  red set), `203` tests / `40` failing.
