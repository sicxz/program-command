# Full Codebase Audit - Issue Backlog (Feb 21, 2026)

## Current Status In The Readiness Program

This backlog remains useful as issue-level prior art, but it is no longer the sole source of truth for multi-department readiness.

Use `docs/audits/production-readiness-program.md` as the current readiness-program narrative and workstream map.

Rough mapping:

- data/runtime integrity items feed into W1. Canonical data/runtime convergence
- dashboard and UI consistency items feed into W2. Shared dashboard shell convergence
- multi-tenant and department-scoping items feed into W3. Canonical multi-department runtime contract
- rollout and verification gaps feed into W4. Release evidence and operational discipline

Scope: scheduler UI, persistence/Supabase, scripts/data pipeline, conflict engine, PAMCAM/reporting readiness.

## Validation snapshot

- `npm test -- --runInBand` -> pass (3 suites, 8 tests)
- `npm run test:coverage -- --runInBand` -> pass; low coverage in conflict/workload paths
- `npm run process-data` -> pass
- `npm run dev` / `npm run build` -> fail on local esbuild binary mismatch
- `npm run calculate-workload` -> fail (CommonJS in ESM project)
- `npm run validate-data` -> fail (CommonJS in ESM project)

---

## Priority 0 - Blockers

### 1) Fix broken npm scripts for workload + validation
- **Severity:** blocker
- **Labels:** `bug`, `scripts`, `tier1`
- **Evidence:** `package.json` points to JS scripts in an ESM project; scripts use `require(...)`.
- **Files:** `package.json:5`, `package.json:16`, `package.json:17`, `scripts/workload-calculator.js:10`, `scripts/validate-enrollment.js:6`
- **Impact:** Tier-1 data workflow is not runnable from npm commands.
- **DoD:** Convert scripts to ESM or rename to `.cjs`; `npm run calculate-workload` and `npm run validate-data` succeed.

### 2) Prevent destructive schedule save (delete then insert without transaction)
- **Severity:** blocker
- **Labels:** `bug`, `data-integrity`, `supabase`
- **Evidence:** save flow deletes all `scheduled_courses` for year before insert; failed insert leaves year empty.
- **Files:** `index.html:8908`
- **Impact:** partial failure can wipe a full schedule.
- **DoD:** Replace with idempotent upsert strategy (or RPC transaction) with rollback safety.
- **Contract:** `docs/scheduler-save-contract.md` (Tree/C-01 canonical save contract and failure matrix)

### 3) Lock down Supabase RLS write policies
- **Severity:** blocker
- **Labels:** `security`, `supabase`
- **Evidence:** schema grants `FOR ALL USING (true)` write access on core tables.
- **Files:** `scripts/supabase-schema.sql:136`, `scripts/supabase-schema.sql:174`, `scripts/supabase-schema.sql:176`
- **Impact:** anonymous clients can write/delete all scheduling data.
- **DoD:** role-scoped policies; only authenticated/authorized writes.
- **Migration:** `scripts/supabase-rls-hardening.sql` (Tree/C-06 idempotent hardening migration)
- **Migration Runbook:** `docs/supabase-rls-hardening-migration.md`
- **Smoke Check:** `npm run check:rls` (`scripts/supabase-policy-smoke-check.js`)
- **Smoke Check Runbook:** `docs/supabase-policy-smoke-check.md`
- **Policy Matrix:** `docs/supabase-rls-write-policy-matrix.md` (Tree/C-05 canonical role-by-table policy contract)

---

## Priority 1 - High

### 4) Stop creating duplicate faculty records from short-name instructor values
- **Severity:** high
- **Labels:** `bug`, `supabase`, `data-quality`
- **Evidence:** UI stores instructor as short form (`F.Lastname`) while DB map expects canonical names; save auto-seeds "missing" faculty.
- **Files:** `index.html:7470`, `index.html:7474`, `index.html:8847`
- **Impact:** duplicate faculty rows, broken joins/preferences/workload linking.
- **DoD:** keep canonical faculty id/name in schedule state; no auto-seeded duplicates on save.

### 5) Respect swap mode when dragging from displaced tray
- **Severity:** high
- **Labels:** `bug`, `scheduler-ui`
- **Evidence:** displaced tray drop path always displaces occupant even when swap mode is enabled.
- **Files:** `index.html:4860`, `index.html:4864`
- **Impact:** swap mode appears broken and inconsistent.
- **DoD:** displaced-to-grid drop follows the same swap/displace rules as regular drag/drop.

### 6) Use stable identity when moving courses (not code-only match)
- **Severity:** high
- **Labels:** `bug`, `scheduler-ui`
- **Evidence:** move lookup uses `findIndex(c => c.code === course.courseCode)`.
- **Files:** `index.html:4926`
- **Impact:** wrong section can move when multiple sections share course code.
- **DoD:** match by unique identity (course id + room + section + origin slot).

### 7) Fix migration script path resolution
- **Severity:** high
- **Labels:** `bug`, `scripts`, `supabase`
- **Evidence:** reads JSON from `path.join(process.cwd(), '..', relativePath)`.
- **Files:** `scripts/migrate-to-supabase.js:34`
- **Impact:** migration fails when run from repo root (`npm`/recommended invocation).
- **DoD:** resolve paths relative to repo root/script directory; migration reads local data reliably.

### 8) Scope course/faculty fetches by department for multi-department support
- **Severity:** high
- **Labels:** `bug`, `multi-tenant`, `supabase`
- **Evidence:** add-course modal queries `courses` and `faculty` without department filter.
- **Files:** `index.html:7425`, `index.html:7456`
- **Impact:** data leakage/cross-department contamination.
- **DoD:** fetch only rows for active department context.

### 9) Remove conflicting duplicate displaced-tray CSS definitions
- **Severity:** high
- **Labels:** `bug`, `ui`, `css`
- **Evidence:** `.displaced-tray` styled twice with conflicting backgrounds/geometry.
- **Files:** `index.html:2102`, `index.html:3497`
- **Impact:** transparent tray/contrast issues/"purple blob" behavior.
- **DoD:** one source of truth for tray styles with accessible contrast and stable collapsed affordance.

---

## Priority 2 - Medium

### 10) Align conflict-resolution times with live scheduler slots
- **Severity:** medium
- **Labels:** `bug`, `conflicts`
- **Evidence:** conflict engine suggests `10:00-12:00` style slots while UI uses `10:00-12:20`.
- **Files:** `js/conflict-engine.js:10`
- **Impact:** recommendations can be invalid/non-actionable.
- **DoD:** derive slots from scheduler config; no stale hardcoded times.

### 11) Forecasting quarter progression should follow AY cycle defaults
- **Severity:** medium
- **Labels:** `enhancement`, `forecasting`
- **Evidence:** next quarter after Spring is set to Summer by default.
- **Files:** `scripts/advanced-forecasting.js:36`
- **Impact:** forecast may target wrong term for planning workflows.
- **DoD:** configurable term cycle; default Fall/Winter/Spring for Design planning.

### 12) Initialize DB client consistently inside DB service read paths
- **Severity:** medium
- **Labels:** `bug`, `supabase`
- **Evidence:** `getSchedule`/`getReleaseTime` use global `supabase` directly.
- **Files:** `js/db-service.js:391`, `js/db-service.js:633`
- **Impact:** intermittent null client behavior if init ordering changes.
- **DoD:** always call `getSupabaseClient()`/`initialize()` before queries.

### 13) Keep repo clean from generated artifacts
- **Severity:** medium
- **Labels:** `chore`, `devex`
- **Evidence:** generated directories/files (`dist/`, logs) are not ignored.
- **Files:** `.gitignore:1`
- **Impact:** noisy diffs and accidental commits.
- **DoD:** ignore generated build artifacts and transient logs.

### 14) Fix component listener teardown for custom elements
- **Severity:** medium
- **Labels:** `bug`, `web-components`
- **Evidence:** `addEventListener(...bind(this))` and `removeEventListener(...bind(this))` use different function refs.
- **Files:** `js/components/lens-filters.js:17`, `js/components/lens-filters.js:22`, `js/components/quarter-nav.js:29`, `js/components/quarter-nav.js:34`
- **Impact:** potential leaked listeners on remount/re-render flows.
- **DoD:** store bound handlers once and remove same references.

---

## Product / Program epics (user-priority roadmap)

### E1) Supabase as single source of truth for program, full degree map, faculty, rooms, constraints
- **Goal:** remove split-brain local JSON vs Supabase runtime.
- **Initial slices:** schema hardening, migration scripts, read/write parity, seed + verification scripts.

### E2) PAMCAM data verification pipeline
- **Goal:** make PAMCAM outputs defensible and reproducible.
- **Input:** unresolved checklist in `docs/pamcam-critical-review-AY2026.md`.
- **Initial slices:** provenance fields, attribution rules, validation report export.

### E3) Dashboard UX parity and shared design system
- **Goal:** all dashboards align with main page UX and components.
- **Initial slices:** shared tokens/components, contrast/accessibility baseline, nav consistency.

### E4) Conflict engine v2
- **Goal:** replace fragile hardcoded pairings with pathway-aware, data-driven constraints.
- **Initial slices:** pull pathways from Supabase, formalize rule weights, add regression tests for real schedules.

### E5) Multi-department tenancy
- **Goal:** onboard additional departments safely.
- **Initial slices:** tenant context in UI, strict department scoping in every query, role-based access.

---

## Suggested issue order for repo filing

1. #1 broken scripts (Tier-1 blockers)
2. #2 destructive save path
3. #3 RLS hardening
4. #4 faculty identity normalization
5. #5/#6 scheduler drag-and-swap correctness
6. #9 displaced tray style conflict
7. #8 department scoping
8. #7 migration path bug
9. #10 conflict slot mismatch
10. #11/#12/#13/#14 cleanup items
11. E1-E5 as epic issues
