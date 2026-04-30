---
title: feat: Add Public Read-Only Schedule View
type: feat
status: completed
date: 2026-04-30
---

# feat: Add Public Read-Only Schedule View

## Overview

Add a production-safe, no-login public schedule page that shows only the schedule UI, defaults to AY 2026-27 and Fall, and cannot write to scheduler data. The recommended shape is a dedicated public route backed by a narrow read-only Supabase RPC, not a query-param mode on the existing editor page.

## Problem Frame

The current production app protects `index.html` and dashboard pages through `js/auth-guard.js`, while `index.html` contains schedule editing, save, import, conflict, workload, and navigation behavior in one large page. A public page should avoid loading those editor affordances entirely. Public database reads also need an explicit contract because current program-scoped RLS policies are authenticated-only and `public.current_program()` returns `NULL` for unauthenticated calls.

## Requirements Trace

- R1. Visitors can open the production schedule without logging in.
- R2. The public page shows only schedule information, not Program Command dashboards or editing tools.
- R3. The initial view is AY 2026-27, Fall.
- R4. Anonymous users cannot create, update, delete, import, save, or access non-schedule administrative data.
- R5. The view reads production schedule data rather than a stale static export.

## Scope Boundaries

- Do not weaken auth for `index.html`, `pages/schedule-builder.html`, dashboards, or administrative pages.
- Do not expose the full course catalog, faculty table, workload data, constraints, release time, or program configuration through broad anonymous table policies.
- Do not add public editing, commenting, downloads, or schedule publishing workflows in this first pass.

## Context & Research

### Relevant Code and Patterns

- `js/auth-guard.js` enforces auth on production/staging by default and supports an override before the guard loads, but the public page should avoid loading the guard unless a future shared shell requires it.
- `index.html` defaults `currentAcademicYear` to `2025-26`, hydrates schedules from Supabase through `loadScheduleDataFromDatabase`, then falls back to local drafts.
- `js/components/quarter-nav.js` defaults to `2025-26` and `spring`; this should either become configurable or the public page should use its own lightweight selector.
- `js/schedule-data-utils.js` already converts database rows into the scheduler's quarter/day/time data shape.
- `js/supabase-config.js` creates the browser Supabase client with the anon key, so public access must be enforced by RLS/RPC, not by hiding secrets.
- `scripts/supabase-program-rls-t03.sql` creates authenticated-only SELECT policies for tenant-scoped tables.
- `scripts/supabase-current-program-helper-t04.sql` documents that unauthenticated calls have no current program.

### Institutional Learnings

- `docs/auth-contract.md` says production/staging hosts enforce auth by default and browser clients must use the anon/publishable key with DB policy as the authority.
- `docs/scheduler-save-contract.md` makes year-scoped schedule persistence the canonical contract; the public view should consume the persisted `scheduled_courses` shape and never call the save RPC.
- `docs/supabase-live-verification-c08-2026-02-28.md` confirms anonymous writes were explicitly denied in live verification.

### External References

- Supabase RLS docs: public schema data should be protected by RLS, anon access requires explicit policies, and the anon role is distinct from an authenticated user.
- Supabase API security docs: public-schema tables without RLS are accessible through the Data API, so exposed schedule data needs an intentional read boundary.

## Key Technical Decisions

- Use a dedicated public page: This keeps the public runtime from loading editor controls, save handlers, dirty-state tracking, presence, session timeout, dashboard nav, and modals from `index.html`.
- Use a narrow read-only RPC or view-backed endpoint: Return only the fields needed to render schedule blocks for the published academic year. This avoids granting broad anonymous SELECT on `scheduled_courses`, `courses`, `faculty`, `rooms`, and `academic_years`.
- Default through explicit constants: Store `PUBLIC_SCHEDULE_DEFAULT_YEAR = '2026-27'` and `PUBLIC_SCHEDULE_DEFAULT_QUARTER = 'fall'` in the public schedule script so the behavior is obvious and testable.
- Keep authenticated editor pages unchanged: Chair/admin workflows continue to use existing auth, save, and RLS paths.

## Open Questions

### Resolved During Planning

- Should this be a mode on `index.html`? No. A route mode would still ship too much editor behavior to anonymous visitors and would require many defensive hides/guards.
- Can we rely on the anon key being public? Yes, but only with RLS/RPC enforcing the allowed data boundary.

### Deferred to Implementation

- Whether the production database already has AY 2026-27 Fall rows: verify during implementation and seed/save the year if needed.
- Final public URL: suggested `public-schedule.html` or `pages/public-schedule.html`; choose based on deployment routing preference during implementation.

## Implementation Units

- [x] **Unit 1: Add Public Schedule Read Contract**

**Goal:** Create a database contract that anonymous visitors can use to read only the public schedule fields.

**Requirements:** R1, R4, R5

**Dependencies:** None

**Files:**
- Create: `scripts/supabase-public-schedule-read.sql`
- Create: `tests/supabase-public-schedule-read.test.js`
- Modify: `docs/auth-contract.md`

**Approach:**
- Prefer a `SECURITY DEFINER` RPC such as `public.get_public_schedule(...)` with a fixed default year of `2026-27`, a fixed or validated program code of `DESN`, and a sanitized return table.
- Return only schedule rendering fields: academic year, quarter, day pattern, time slot, section, course code, course title, credits, instructor display name, room display name, and projected enrollment when needed.
- Grant `EXECUTE` to `anon` and `authenticated`; do not grant anonymous write permissions.
- If dynamic future publishing is needed, add a tiny allowlist table or flag rather than opening all years.

**Patterns to follow:**
- `scripts/supabase-schedule-sync-rpc.sql` for RPC structure, search path, grants, and tests.
- `docs/supabase-live-verification-c08-2026-02-28.md` for anon write-denial expectations.

**Test scenarios:**
- Happy path: SQL defines a public schedule RPC and grants execute to `anon`.
- Security: SQL does not grant INSERT, UPDATE, DELETE, or broad table SELECT to `anon`.
- Scope: SQL limits anonymous output to AY 2026-27 or an explicit publication allowlist.
- Data minimization: SQL return columns exclude audit fields, IDs where not needed, user identifiers, program config, and non-schedule tables.

**Verification:**
- Anonymous clients can read the public schedule data, and anonymous write attempts remain denied.

- [x] **Unit 2: Build Public Schedule Page**

**Goal:** Add a no-login page that renders the schedule only and defaults to AY 2026-27 Fall.

**Requirements:** R1, R2, R3, R5

**Dependencies:** Unit 1

**Files:**
- Create: `public-schedule.html`
- Create: `pages/public-schedule.js`
- Modify: `css/design-system.css` or create `css/public-schedule.css`
- Test: `tests/public-schedule.test.js`

**Approach:**
- Load only the assets needed for a read-only schedule: Supabase config, schedule data utilities, and the public schedule renderer.
- Do not include `js/auth-guard.js`, `js/auth-service.js`, `js/dirty-state-tracker.js`, editor modals, save buttons, import tools, dashboard nav, or presence indicators.
- On load, call the public schedule RPC, convert rows with `ScheduleDataUtils.buildScheduleDataFromDatabaseRecords`, and render Fall 2026 first.
- Offer quarter tabs for Fall/Winter/Spring if the public data includes them, but keep AY fixed to `2026-27` for this pass unless implementation confirms a safe publication list.

**Patterns to follow:**
- `index.html` schedule grid rendering vocabulary and `js/schedule-data-utils.js` data shape.
- `js/components/quarter-nav.js` display-year logic, but with defaults changed or copied into a lightweight public control.

**Test scenarios:**
- Happy path: page initializes with year `2026-27` and quarter `fall`.
- Happy path: RPC rows render into the correct day/time/room schedule cells.
- Edge case: an empty schedule shows a read-only empty state without login redirects.
- Security: HTML source does not load `auth-guard.js`, editor scripts, or expose save/import controls.
- Error path: failed RPC shows a non-editable error state and does not fall back to local drafts.

**Verification:**
- Opening the public route in a signed-out production-like browser shows the Fall 2026 schedule and no editable controls.

- [x] **Unit 3: Wire Defaults and Production Deployment Behavior**

**Goal:** Ensure production deploys the public page with the intended default and does not alter protected app behavior.

**Requirements:** R1, R3, R4

**Dependencies:** Units 1 and 2

**Files:**
- Modify: `vite.config.js` if the route needs build/deploy handling
- Modify: `README.md`
- Test: `tests/auth-editstate.integration.test.js` or a new route-focused auth guard test

**Approach:**
- Confirm the public page is included in the Vite build output.
- Add a short README note documenting the public URL and the default AY/quarter.
- Add regression coverage proving existing protected routes still redirect to login on production-like hosts.

**Patterns to follow:**
- Existing auth guard tests in `tests/auth-editstate.integration.test.js`.
- Existing production auth contract in `docs/auth-contract.md`.

**Test scenarios:**
- Happy path: `public-schedule.html` remains accessible without a session.
- Integration: `index.html` still redirects to login on a non-localhost production-like host with no session.
- Regression: `?auth=disabled` behavior is not required for the public page.

**Verification:**
- Public schedule route is reachable signed out; authenticated app routes remain protected.

- [x] **Unit 4: Production Data Readiness Check**

**Goal:** Make sure AY 2026-27 Fall production schedule data exists and is the data the public page reads.

**Requirements:** R3, R5

**Dependencies:** Units 1 and 2

**Files:**
- Modify: `docs/chair-ay2627-quick-start.md`
- Optional create: `docs/public-schedule-release-checklist.md`

**Approach:**
- Verify `academic_years.year = '2026-27'` exists for the Design program and has Fall `scheduled_courses` rows.
- If missing, use the authenticated chair workflow to save/publish the schedule rather than allowing the public page to create data.
- Document the release check so future default-year changes are deliberate.

**Patterns to follow:**
- `docs/chair-ay2627-quick-start.md`
- `docs/supabase-live-verification-c08-2026-02-28.md`

**Test scenarios:**
- Test expectation: none -- this is an operational verification and documentation unit.

**Verification:**
- Production public view shows the same AY 2026-27 Fall rows that the authenticated scheduler shows.

## System-Wide Impact

- **Interaction graph:** Anonymous visitor -> public schedule page -> public schedule RPC -> sanitized production schedule rows. Authenticated chair/admin -> existing protected editor pages -> existing save RPC.
- **Error propagation:** Public RPC/read failures should surface as a read-only unavailable state, not login redirects or local draft fallbacks.
- **State lifecycle risks:** The public page should not touch `designSchedulerData_*`, dirty state, session recovery drafts, or save attribution.
- **API surface parity:** Existing editor save/read behavior stays unchanged; the new RPC is read-only and public-facing.
- **Integration coverage:** Route-level tests need to prove public accessibility and protected-route preservation together.
- **Unchanged invariants:** Anonymous writes remain denied; the browser never receives service-role credentials; production dashboards remain login-protected.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Accidentally exposing non-schedule data | Use a narrow RPC with sanitized columns instead of broad anonymous table SELECT. |
| Public page drifts from editor rendering | Reuse `js/schedule-data-utils.js` and copy only stable schedule display rules from `index.html`. |
| Public route accidentally inherits editor affordances | Build a dedicated page that never loads editor modules or action buttons. |
| Empty production AY 2026-27 data | Add a release checklist and verify against authenticated scheduler data before sharing the URL. |
| Future years need public access | Add an explicit publication allowlist rather than making all years anonymous-readable. |

## Documentation / Operational Notes

- Document the public URL, default AY/quarter, and release verification steps.
- Update the default constants when the published academic year changes.
- Treat the public RPC as a production API surface; changing its output fields should be covered by tests.

## Sources & References

- Related code: `js/auth-guard.js`
- Related code: `index.html`
- Related code: `js/components/quarter-nav.js`
- Related code: `js/schedule-data-utils.js`
- Related code: `js/supabase-config.js`
- Related SQL: `scripts/supabase-program-rls-t03.sql`
- Related SQL: `scripts/supabase-current-program-helper-t04.sql`
- Related docs: `docs/auth-contract.md`
- Related docs: `docs/scheduler-save-contract.md`
- External docs: `https://supabase.com/docs/guides/database/postgres/row-level-security`
- External docs: `https://supabase.com/docs/guides/api/securing-your-api`
