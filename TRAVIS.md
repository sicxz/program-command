# Travis Update

## Where We Are

Repo state as of 2026-04-17:

- Branch: `codex/production-readiness-audit`
- Working tree: clean
- Latest pushed commits:
  - `c2f4eac` `feat: resolve canonical program config during onboarding`
  - `28b9a38` `feat: seed canonical design program config`
  - `da5a88d` `fix: quiet onboarding bootstrap program probes`
  - `0684bb7` `feat: favor canonical runtime data for readiness dashboards`
  - `6dc28fd` `feat: add production readiness audits and canonical runtime baselines`

The project is still in the production-readiness hardening phase, not the Engineering rollout phase yet.

## What Was Completed

### 1. Production-readiness audit foundation

The audit/program-plan work is in `docs/audits/` and the working branch is already oriented around W1.

Important docs:

- `docs/audits/production-readiness-program.md`
- `docs/audits/data-truth-audit.md`
- `docs/audits/platformization-audit.md`
- `docs/audits/multi-department-release-gate.md`

### 2. Runtime/data hardening

The runtime now does a much better job of preferring canonical data and telling the truth when it falls back.

Important code:

- `js/db-service.js`
- `js/canonical-dashboard-data.js`
- `pages/recommendations-dashboard.js`
- `pages/course-optimizer-dashboard.js`
- `pages/constraints-dashboard.js`
- `pages/schedule-builder.js`
- `js/supabase-config.js`

### 3. Develop vs production environment handling

Supabase config was cleaned up so localhost defaults to develop and non-local hosts default to production, with explicit overrides still available.

Important code:

- `js/supabase-config.js`
- `tests/supabase-config.environments.test.js`

Develop:

- `https://cstcwplvioheazoghkgf.supabase.co`

Production:

- `https://ohnrhjxcjkrdtudpzjgn.supabase.co`

### 4. Canonical `programs.config` bridge for Design

This was the latest major step.

What exists now:

- Repo-side canonical seed SQL:
  - `scripts/supabase-program-config-seed-t07.sql`
- Seed documentation:
  - `docs/supabase-program-config-seed-t07.md`
- Contract tests:
  - `tests/supabase-program-config-seed-t07.test.js`

The develop database now has a verified canonical `ewu-design` row in `public.programs` with:

- `legacy_department_code = DESN`
- `profile_schema_version = 1`
- `profile_source = department-profiles/design-v1.json`
- `config.profile.identity.code = DESN`
- `config.profile.identity.displayName = EWU Design`

### 5. Onboarding now resolves canonical Design config

The onboarding page no longer just says "bootstrap mode" when canonical Design config exists in Supabase.

Verified behavior:

- `pages/department-onboarding.html` now reports:
  - `Canonical program config is available in Supabase.`
- The page resolves canonical config via `ewu-design`
- The remaining browser console noise is just missing `favicon.ico`

Important code:

- `js/profile-loader.js`
- `pages/department-onboarding.js`
- `docs/profile-loader-t06.md`
- `docs/department-onboarding-qa-pack.md`

## What This Means

We have crossed an important line:

- Design no longer exists only as a bootstrap/local-profile concept
- Develop Supabase now has a canonical Design program config
- The onboarding page can confirm that canonical runtime config exists

But we have **not** finished the full multi-department platform yet.

## 2026-04-24 Priority Correction

The next real work is Design core readiness, not Engineering rollout and not onboarding promotion as the main lane.

Current priority order:

1. Prove every production-relevant Design scheduling datum is in canonical persisted data, or explicitly classify it as draft-only, seed/import, unavailable, or excluded.
2. Clean up release-gated dashboards after they read the same canonical Design runtime bundle.
3. Make the conflict engine work from canonical Design inputs and produce deterministic, explainable, actionable conflicts.
4. Build the conflict engine wizard for chair, curriculum chair, and department admin review.

New plan:

- `docs/plans/2026-04-24-001-refactor-design-data-conflict-readiness-plan.md`

Short answer: the database truth problem is not fully fixed yet. Canonical Design config and parts of the saved schedule/runtime path exist, but release-gated surfaces are still mixed because local JSON, localStorage, fallback profile data, and hardcoded conflict assumptions still affect production-visible behavior.

## Previous Suggested Next Slice

This was the previous suggestion before the 2026-04-24 priority correction. Keep it as context, but do not treat it as the next main lane unless the Design core readiness plan is paused.

The next slice should be:

### Build the canonical write/promote path for onboarding

Right now onboarding can:

- load manifest profiles
- create local versioned profiles
- confirm canonical Design config exists

But it still cannot do the real platform move:

- write/promote a reviewed onboarding profile into `public.programs.config`

That was the previous meaningful feature suggestion. It is now deferred behind Design data truth and conflict workflow readiness.

Recommended next work:

1. Define the promotion contract from onboarding profile draft -> canonical `programs.config`
2. Add the write path in app code
3. Decide whether Design promotion updates the existing `ewu-design` row in place or uses an explicit draft/review/publish flow
4. Add tests for canonical promotion behavior
5. Verify the onboarding page can both read and promote canonical program config

After that:

6. Start the Engineering pilot on top of the canonical program path, not on top of bootstrap-only local profile behavior

## Previous Suggested Immediate Target (Deferred)

If the Design core readiness plan is explicitly paused, this deferred implementation target can be resumed:

`Allow Department Onboarding to promote a versioned profile into canonical Supabase programs.config for the active program`

Good starting files:

- `pages/department-onboarding.js`
- `js/profile-loader.js`
- `js/department-profile.js`
- `js/supabase-config.js`
- `docs/department-profile-schema-v1.md`
- `docs/program-profile-schema.md`

Potential new pieces:

- a dedicated DB service/program-config service
- explicit save/update helpers for `public.programs`
- docs for promotion rules and rollback

## Verification State

Recently verified:

- `npm test -- tests/profile-loader.test.js tests/supabase-program-config-seed-t07.test.js tests/department-profile.onboarding.test.js`
- browser verification of onboarding page with Playwright CLI
- onboarding runtime card correctly reporting canonical Supabase config for Design

## Starting Prompt For Next Session

Use this to continue cleanly:

> Continue from `docs/plans/2026-04-24-001-refactor-design-data-conflict-readiness-plan.md`. Read `TRAVIS.md` first. We are focusing on Design core readiness: prove every production-relevant Design scheduling datum is canonical or explicitly classified, clean dashboards after they use the same canonical runtime bundle, make the conflict engine work from canonical Design inputs, and then build the conflict wizard for chair, curriculum chair, and department admin review. Do not start Engineering rollout yet.

## If You Need A Shorter Session Goal

Use this narrower prompt:

> Start Unit 1 of `docs/plans/2026-04-24-001-refactor-design-data-conflict-readiness-plan.md`: build the Design data source inventory, carry forward the readiness audit artifacts from `codex/production-readiness-audit` if needed, and classify each Design scheduling data class as canonical, draft-only, seed/import, unavailable, excluded, or blocking mixed source.

## 2026-04-23 Follow-Up Note

- Clean checkout used for current local dev testing: `/Users/tmasingale/Documents/GitHub/scheduler-v2-codex-develop-fix`.
- Dependency audit cleanup was merged to `develop` in PR #247. Validation passed: full Jest, onboarding QA, Vite build, Google Sheets import smoke test, and `npm audit --audit-level=low`.
- Original checkout `/Users/tmasingale/Documents/GitHub/scheduler-v2-codex` had a broken `HEAD` ref pointing at `codex/supabase-programs-rls`; many files there are iCloud/FileProvider `compressed,dataless` placeholders and block reads until hydrated. Confirmed examples: `TRAVIS.md`, `tests/production-readiness-program-doc.test.js`, and runtime files under `js/`, `css/`, and `dist/`.
- Other open/relevant lanes:
  - #240 / PR #242: scheduler worktree and sibling clone cleanup; draft PR has green checks.
  - #246: Supabase programs RLS hardening; open against `main` with green checks.
