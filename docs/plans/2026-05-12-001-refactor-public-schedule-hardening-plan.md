---
title: "refactor: harden public schedule view and centralize canonical data sources"
type: refactor
status: active
date: 2026-05-12
origin: ce-review of branch codex/internal-schedule-match-public-view (2026-05-12)
---

# Harden Public Schedule View and Centralize Canonical Data Sources

## Overview

This plan resolves the P0–P2 findings from the 2026-05-12 ce-review of `codex/internal-schedule-match-public-view`. It addresses the user's three stated goals: (1) close the security gap introduced by the new Supabase env-switching layer, (2) make production and dev look/feel hold up over time by extracting shared Foundry tokens, and (3) replace hard-coded constants in `pages/public-schedule.js` with reads from the existing canonical data sources (`data/course-catalog.json`, `scripts/faculty-mapping.json`, `data/room-constraints.json`).

The review proved drift is already happening — `DESN 215` is `'Indesign'` in the JS overrides and `'InDesign'` in the SQL sync. This plan removes the drift surface.

## Problem Frame

- The PR introduces a public read-only schedule page and routes its data to Supabase production, but does so by duplicating canonical data into a 800-line IIFE module (`pages/public-schedule.js`). Course titles, faculty roster + colors, room metadata, and the list of public academic years all live as frozen constants in that file.
- The same PR widens the Supabase config layer to support env switching, but the new query-param and localStorage overrides apply on production hosts with no domain allowlist — enabling a client-redirect attack via a phishing URL.
- The faculty canonical-name resolver uses bidirectional substring matching that misroutes any instructor whose name contains an alias key as a substring (`Millstone` → S.Mills).
- The editor schedule was reskinned to match the public view by inlining ~148 lines of `.foundry-production` CSS into `index.html`; the public view ships the same tokens via `css/public-schedule.css`. Two copies will drift.

The user asked the review to focus on "look and feel of production synced" and "real data, not hard-coded value." Both are surface symptoms of the same root cause: shared concerns implemented twice rather than once.

## Requirements Trace

- **R1.** Eliminate the open-redirect / client-hijack vector in `js/supabase-config.js` so URL query params and localStorage cannot retarget a deployed page's Supabase client. *(ce-review P0 #1)*
- **R2.** Make `public-schedule.html` deterministically use the production Supabase project regardless of prior localStorage state. *(P1 #4)*
- **R3.** Align Supabase row-level access with `docs/auth-contract.md` so the public-schedule RPC is the *only* anon read path — anon SELECT on `scheduled_courses` and `faculty` must not return more than the RPC contract intends. *(P1 #2)*
- **R4.** Replace bidirectional substring faculty matching with deterministic exact/word-boundary matching grounded in `scripts/faculty-mapping.json`. *(P1 #3)*
- **R5.** Read course titles, faculty roster/colors, room list, and the public-years list from the existing canonical files (or a single derived module), not from frozen constants in `pages/public-schedule.js`. Fix the existing `DESN 215` drift as part of the migration. *(P1 #5, #6, #7)*
- **R6.** Ensure the public-schedule page can never call into a null Supabase client due to DOMContentLoaded handler ordering. *(P1 #8)*
- **R7.** Extract Foundry design tokens to a single shared CSS file consumed by both `index.html` and `public-schedule.html`. *(P2 #9)*
- **R8.** Add timeouts and a real failure-vs-empty distinction to the public schedule's data path so a slow Supabase no longer hangs the page indefinitely. *(P2 #10, #16)*
- **R9.** Add validation tests that catch the failure modes the current suite misses: drift between the JS catalog and the SQL canonical, the faculty substring false-match, the empty-quarter render path, and the `?supabaseUrl=` override on production hosts. *(testing gaps consolidated across reviewers)*

## Scope Boundaries

**In scope**
- Files touched on `codex/internal-schedule-match-public-view` and the canonical data sources they should consume
- Supabase env-switching surface in `js/supabase-config.js`
- RLS policy review for `scheduled_courses` and `faculty` (read-only audit + tightening migration)
- Shared CSS extraction limited to the Foundry tokens already inlined in this branch

**Out of scope**
- Broader cleanup of the 35+ stale `codex/*` branches in the GitHub remote (user mentioned this; tracked separately — see Documentation/Operational Notes)
- Schedule-grid renderer extraction into a shared module (review P2 #15). This is the right long-term move but is bigger than this plan; deferred to a follow-up.
- Rotating the production anon key. The review flagged it (P2 #17); a rotation procedure is documented separately, not enacted here.
- Untracked test files in the worktree — `tests/audit-runtime-dependencies.test.js` and the other un-staged files listed in `git status` — are separate audit/exploratory work and not gated by this plan. They may be committed independently or cleaned up per the branch-hygiene task in Operational Notes.

## Context & Research

### Relevant Code and Patterns

- `pages/public-schedule.js:17-140` — frozen-constant blocks (`DEFAULTS`, `PUBLIC_YEARS`, `ROOM_ORDER`, `ROOM_LABELS`, `COURSE_TITLE_OVERRIDES`, `FACULTY_COLORS`, `FALLBACK_FACULTY_COLORS`, `FACULTY_ALIASES`). These are the targets to remove.
- `pages/public-schedule.js:678-702` (`loadCourseCatalog`) — already loads `data/course-catalog.json`; the override map shadows it. Pattern to keep, scope to expand.
- `js/supabase-config.js:38-208` — env-resolution helpers. `isPublicSchedulePage()` and `isLocalSupabaseHost()` already exist (lines 159, 161); they're just consulted in the wrong order. Pattern to keep, ordering to fix.
- `js/faculty-manager.js:19` — existing `FACULTY_COLORS` IIFE constant. The editor's source of truth today. Candidate for promotion to a shared module that both the editor and the public view consume.
- `scripts/faculty-mapping.json` — canonical `nameNormalization` map. Does not currently include colors; will need a small additive change or a sibling file.
- `data/room-constraints.json` — canonical room list with `excludeFromGrid: true` already flagging room 207. This is the right room source.
- `scripts/supabase-public-schedule-read.sql:34` — `v_allowed_years` array, duplicating `PUBLIC_YEARS`. Either derive years from the database or accept SQL as the single source and have JS read them.
- `index.html` — ~148 lines of `.foundry-production` CSS added in this PR, duplicating tokens in `css/public-schedule.css`. Extract target.
- IIFE pattern (CLAUDE.md): all `js/` shared modules use IIFE singletons; any new shared module created by this plan must follow that pattern.

### Institutional Learnings

- `docs/plans/2026-04-30-001-feat-public-schedule-view-plan.md` — the originating plan stated the public schedule must read via the `get_public_schedule` RPC and must not grant anonymous table reads. The current implementation honors the page's call shape but the underlying `Public read` RLS policies on `scheduled_courses` and `faculty` undermine the contract.
- `docs/auth-contract.md` — "Public access is limited to the read-only `public.get_public_schedule` RPC and must not grant anonymous table reads." R3 enforces this.
- `docs/public-schedule-release-checklist.md` — already lists "Confirm RPC exists" and validation queries; this plan should add an RLS verification step there.

### External References

- None warranted. The codebase has established patterns for all the work in this plan (IIFE modules, JSON-loaded canonical data, Jest tests against the data files). External research would add no value.

## Key Technical Decisions

- **Decision: Gate Supabase env/URL/anonKey overrides to local hosts only.** The current implementation honors `?supabaseUrl=`, `?supabaseAnonKey=`, `?supabaseEnv=`, and matching localStorage keys on any host. We will gate all three override sources (query param, localStorage, `window.PROGRAM_COMMAND_SUPABASE_CONFIG`) behind `isLocalSupabaseHost(hostname)`. *Rationale:* The override mechanism exists for local development; honoring it on production hosts is what creates the client-hijack vector. A deploy-time override, if ever needed in the future, can be injected server-side rather than via URL params.
- **Decision: `isPublicSchedulePage()` wins over storage/query overrides.** Even with overrides gated to local hosts, a developer can run `public-schedule.html` on `localhost` and we still want it to use production. `resolveSupabaseEnvironmentConfig()` will short-circuit to `production` when `isPublicSchedulePage()` is true, before reading any override source. *Rationale:* The public schedule is a read-only production view by definition; "I want to test the public view against dev data" is a corner case that warrants an explicit query param (e.g., `?supabaseEnv=develop`) rather than a silent localStorage carryover.
- **Decision: Promote `FACULTY_COLORS` to a shared IIFE module `js/faculty-display.js`.** Both `js/faculty-manager.js` and `pages/public-schedule.js` will consume it. Faculty *display* colors stay in JS (the canonical mapping doesn't currently carry color, and adding a `colors` block to `scripts/faculty-mapping.json` mixes a data file with a presentation concern). The *name normalization* logic moves to consume `scripts/faculty-mapping.json` directly. *Rationale:* Keeps the IIFE-singleton convention from CLAUDE.md, gives both pages a single source for color, and lets the JSON file stay focused on identity/normalization.
- **Decision: Exact + word-boundary matching for faculty names; no substring fallback.** `getCanonicalFacultyName()` will: (1) try exact match against the canonical mapping; (2) try word-boundary match (e.g., `/\bMills\b/i`); (3) return the original name with `faculty-unknown` styling. No bidirectional `includes()`. *Rationale:* Eliminates the entire class of false matches the review identified. The fallback color path already exists for unknowns and is the correct landing zone.
- **Decision: Course titles read from `data/course-catalog.json`; `COURSE_TITLE_OVERRIDES` removed entirely.** The catalog is already loaded; the override map only existed to paper over historical drift. Any genuinely-different public-display title can be added to the catalog itself or expressed as a field on the catalog row (e.g., `publicTitle`). *Rationale:* One source of truth. The `DESN 215 'Indesign' vs 'InDesign'` drift this PR shipped is exactly what removing the override prevents.
- **Decision: `PUBLIC_YEARS` derived at runtime from `get_public_schedule` distinct years, with a fallback constant only for offline/degraded operation.** The RPC will be extended (or a new lightweight RPC added) to return the distinct academic years the public schedule covers. The `v_allowed_years` allowlist stays in SQL as the authority; JS reflects, not duplicates. *Rationale:* Removes the two-place hardcode and makes the year list self-updating as new years are added to the SQL allowlist.
- **Decision: `ROOM_ORDER` / `ROOM_LABELS` read from `data/room-constraints.json`, filtering by `excludeFromGrid !== true`.** The catalog already has the canonical list, capacity, type, and exclusion flag. *Rationale:* Removes the silent-drop bug where a course scheduled in an unknown room disappears from the public view.
- **Decision: Foundry tokens extracted to `css/foundry-theme.css`, loaded by both pages.** No JS-level theme machinery — just CSS custom properties under a single selector. *Rationale:* The user's "look/feel synced" ask is structural, not visual. The current parity holds only until someone edits one copy.
- **Decision: Tighten RLS as a separate migration, not by editing the existing schema file.** Add `scripts/supabase-restrict-public-table-reads.sql` that revokes `anon` SELECT on the relevant tables and re-grants only what the RPC needs via `SECURITY DEFINER`. Keep the migration idempotent. *Rationale:* Production already runs the broad policy; a forward migration is auditable, reviewable, and rollback-able. Editing schema.sql in place loses the change history.

## Open Questions

### Resolved During Planning

- **Should faculty colors live in the JSON mapping or a JS module?** Resolved: shared JS module (`js/faculty-display.js`). Keeps the mapping file focused on identity normalization and follows the IIFE convention.
- **Should we keep the `?supabaseEnv=develop` override on `public-schedule.html`?** Resolved: yes for local hosts only. Useful for local QA of the public view against dev data; not honored on production hosts.
- **Should `PUBLIC_YEARS` be derived from data or kept as a small JSON file?** Resolved: derived from a Supabase RPC at load time, with a hardcoded fallback only if the RPC fails. Source of truth stays in SQL (`v_allowed_years`).

### Deferred to Implementation

- **Exact RPC name for distinct public years.** Will be either an extension of `get_public_schedule` or a new `get_public_schedule_years` function. Implementer picks based on whether the existing RPC can cheaply return a distinct-year metadata column.
- **Whether `js/faculty-display.js` exposes a class or pure functions.** Both fit the IIFE pattern; pick at write time based on whether internal mutable state is needed (likely not).
- **Whether room labels need a `publicLabel` field on `data/room-constraints.json` rows.** The current overrides relabel `206`→`UX Lab`, `CEB 102`→`Design Studio`, etc. The `name` field already carries `"206 UX Lab"` — implementer decides whether to parse or to add a sibling field.
- **Whether `js/supabase-config.js` is rewritten or trimmed in place.** Review found 274 lines for a 2-environment switcher (P2 #14). The simplification is genuinely useful but is decoupled from R1–R2; defer the file-shape decision to implementation, after R1 and R2 are in.

## Implementation Units

- [ ] **Unit 1: Gate Supabase override sources to local hosts and make public-schedule force production**

**Goal:** Close the open-redirect vector (R1) and guarantee `public-schedule.html` always uses production (R2).

**Requirements:** R1, R2

**Dependencies:** None — this is the highest-priority unit and lands first.

**Files:**
- Modify: `js/supabase-config.js` (rework `resolveSupabaseEnvironmentConfig`, `readSupabaseOverride`, `getRequestedSupabaseEnvironmentName`)
- Modify: `tests/supabase-config.environments.test.js`

**Approach:**
- In `resolveSupabaseEnvironmentConfig()`, short-circuit to the `production` config when `isPublicSchedulePage()` returns true, before any override lookups.
- Wrap `readSupabaseSearchParam`, `readSupabaseStorageValue`, and `readWindowSupabaseOverride` (only when consulted for environment/url/anonKey overrides) behind `isLocalSupabaseHost(hostname)`. Do not gate storage reads that are unrelated to env switching.
- Preserve the existing `prod`/`dev`/`development` shortcuts only if they survive Unit 6; otherwise remove with Unit 6.

**Patterns to follow:**
- `isPublicSchedulePage()` and `isLocalSupabaseHost()` already exist in the same file — extend their use rather than re-implementing.
- Keep the file's IIFE-friendly module shape (no ES `import`/`export` for runtime code).

**Test scenarios:**
- *Happy path:* On `localhost` editor, `?supabaseEnv=develop` is honored.
- *Happy path:* On any `*.local` editor host, localStorage `programCommand.supabase.environment=develop` is honored.
- *Edge case:* On `localhost` with `public-schedule.html` in the path, the resolver returns `production` even when localStorage says `develop` and the URL has `?supabaseEnv=develop`.
- *Error path:* On a deployed (non-local) host, `?supabaseUrl=https://attacker.supabase.co&supabaseAnonKey=...` is ignored and the production URL/key are used. Assert the configured client URL is the production project ref.
- *Error path:* On a deployed host, localStorage `programCommand.supabase.develop.anonKey` is ignored.
- *Integration:* `public-schedule.html` served from `127.0.0.1:8080` with localStorage env=`develop` still issues its RPC against the production project ref.
- *Error path:* On a deployed (non-local) host, `window.PROGRAM_COMMAND_SUPABASE_CONFIG.production.url` set to `https://attacker.supabase.co` is ignored and the production project ref is used. Same for `.develop.anonKey`.

**Verification:**
- All new and existing assertions in `tests/supabase-config.environments.test.js` pass.
- Manual: open `https://<prod-host>/public-schedule.html?supabaseEnv=develop&supabaseUrl=https://attacker.supabase.co` and confirm via DevTools that `window.SUPABASE_CONFIG.projectRef === 'ohnrhjxcjkrdtudpzjgn'`.

---

- [ ] **Unit 2: Restrict anon table reads to align with the auth contract**

**Goal:** Make the public-schedule RPC the only anon read path so `docs/auth-contract.md` holds (R3).

**Requirements:** R3

**Dependencies:** None — independent of Unit 1; can land in parallel.

**Files:**
- Create: `scripts/supabase-restrict-public-table-reads.sql`
- Create: `scripts/supabase-restrict-public-table-reads-rollback.sql`
- Modify: `docs/public-schedule-release-checklist.md` (add verification step)
- Test: `tests/supabase-restrict-public-table-reads.test.js`

**Approach:**
- The new migration drops or replaces the existing `"Public read"` policy on `scheduled_courses` and `faculty` (and any other table the audit surfaces) with policies that deny anon SELECT (`FOR SELECT TO anon USING (false)`) or revoke the privilege entirely.
- Verify `EXECUTE` on `public.get_public_schedule` to `anon` remains intact; it's `SECURITY DEFINER` and runs with the owner's privileges, so the function still works.
- Companion rollback script restores the prior `"Public read"` policy verbatim so an emergency revert is one command.
- Migration is wrapped in `BEGIN; ... COMMIT;` with `DROP POLICY IF EXISTS` for idempotency.
- Update the release checklist with a SQL verification query that confirms an anon JWT cannot SELECT from `scheduled_courses` directly.

**Patterns to follow:**
- `scripts/supabase-public-schedule-read.sql` (style, `BEGIN`/`COMMIT`, header comments).
- Existing RLS policies in `scripts/supabase-schema.sql`.

**Test scenarios:**
- *Happy path:* The migration file contains `DROP POLICY IF EXISTS "Public read"` for each affected table, and re-creates a restrictive policy or revokes `SELECT FROM anon`.
- *Happy path:* The migration grants nothing additional to `anon` beyond `EXECUTE` on `public.get_public_schedule`.
- *Edge case:* Rollback script restores the same policy names so re-applying the forward migration is a no-op idempotency check.
- *Integration:* Manual verification step in `docs/public-schedule-release-checklist.md` runs `SELECT count(*) FROM scheduled_courses` under an anon JWT and expects either an error or zero rows.

**Verification:**
- Static SQL contract test passes.
- Manual: against a staging Supabase, an anon client errors on direct `from('scheduled_courses').select('*')` while `rpc('get_public_schedule', ...)` continues to return rows.

---

- [ ] **Unit 3: Replace bidirectional substring matching with deterministic faculty name resolution**

**Goal:** Eliminate the `Millstone → S.Mills` class of false matches (R4).

**Requirements:** R4

**Dependencies:** Unit 4. Unit 3 consumes `FacultyDisplay.getCanonicalFacultyName()` from Unit 4's shared module. Order: Unit 4 → Unit 3.

**Files:**
- Modify: `pages/public-schedule.js` (replace `getCanonicalFacultyName`, drop `FACULTY_ALIASES`, drop `normalizeFacultyKey` if unused after the change)
- Modify: `tests/public-schedule.test.js`

**Approach:**
- `getCanonicalFacultyName(raw)` becomes: (1) trim/normalize whitespace; (2) exact match against the canonical mapping loaded from `scripts/faculty-mapping.json` via Unit 4's shared module; (3) word-boundary match against canonical last names; (4) return the trimmed original with the unknown styling.
- Remove `FACULTY_ALIASES` entirely.
- Keep `getFallbackFacultyColor` for the unknown case.

**Patterns to follow:**
- The existing `getFacultyInfo()` shape (returns `{className, color, name}`) is the consumer contract; preserve it.

**Test scenarios:**
- *Happy path:* `"T. Masingale"` and `"Travis Masingale"` both resolve to `T.Masingale` with the canonical color.
- *Edge case:* `"Dr. K. Millstone"` resolves to itself (unknown faculty) with the `faculty-unknown` styling and a fallback color — *not* S.Mills.
- *Edge case:* `"Smith Mills"` resolves to itself (or to S.Mills only via word-boundary on the second token — explicit assertion either way so the chosen rule is clear).
- *Edge case:* `"lybbertson"` resolves to unknown, not M.Lybbert.
- *Edge case:* Empty string and `null` resolve to `TBD` (existing behavior preserved).
- *Integration:* Rendering a schedule containing `"Dr. Millstone"` in the RPC payload paints a faculty-unknown block in the grid; the faculty legend does not list S.Mills.

**Verification:**
- All new and existing `tests/public-schedule.test.js` assertions pass.
- Manual: load `public-schedule.html` against a fixture with an unknown instructor; the legend shows them under the generated/unknown bucket.

---

- [ ] **Unit 4: Extract shared faculty display module and load name normalization from JSON**

**Goal:** Single source of faculty colors + canonical names across editor and public view (part of R5, and the canonical-mapping-load portion of R4).

**Requirements:** R5, R4 (canonical mapping load — Unit 3 implements the matching logic that consumes this mapping)

**Dependencies:** Should land before Unit 3; Unit 3 consumes it.

**Files:**
- Create: `js/faculty-display.js` (IIFE singleton exposing `getFacultyInfo`, `getCanonicalFacultyName`, `getKnownFaculty`)
- Modify: `js/faculty-manager.js` (delegate to `FacultyDisplay` instead of holding its own `FACULTY_COLORS`)
- Modify: `pages/public-schedule.js` (drop `FACULTY_COLORS`/`FALLBACK_FACULTY_COLORS`/`FACULTY_ALIASES`; consume `FacultyDisplay`)
- Modify: `index.html` and `public-schedule.html` (load `js/faculty-display.js` before `js/faculty-manager.js` and before `pages/public-schedule.js`)
- Test: `tests/faculty-display.test.js`

**Approach:**
- New IIFE module owns the color map for known faculty and the fallback palette.
- The module fetches `scripts/faculty-mapping.json` on first call and caches the result (mirror the `loadCourseCatalog` memoization pattern in `pages/public-schedule.js:678-702`). The cache is module-singleton, session-wide: both `index.html` and `public-schedule.html` load the same `js/faculty-display.js`, so the JSON is fetched once per page load and re-used across both pages within a session.
- `js/faculty-manager.js`'s `FACULTY_COLORS` constant is removed; its `getColorForFaculty()` (or equivalent) delegates to `FacultyDisplay.getFacultyInfo()`.
- The shared module exposes a synchronous color lookup (using the in-memory cache) and an async `ready()` for callers that need to await initial JSON load.

**Patterns to follow:**
- `loadCourseCatalog` memoization in `pages/public-schedule.js`.
- IIFE singleton shape from any module in `js/` (e.g., `js/schedule-manager.js`).

**Test scenarios:**
- *Happy path:* `FacultyDisplay.getFacultyInfo('T.Masingale')` returns the canonical color and class.
- *Happy path:* `FacultyDisplay.getFacultyInfo('Travis Masingale')` (the form in `scripts/faculty-mapping.json`) resolves to the same canonical entry as `'T.Masingale'`.
- *Edge case:* An instructor name not in the mapping returns `faculty-unknown` styling and a deterministic fallback color (same input → same color across calls).
- *Edge case:* Calling before `ready()` resolves returns the unknown styling but does not throw.
- *Integration:* `js/faculty-manager.js`'s consumer methods produce the same display output before and after the refactor for every faculty member in `scripts/faculty-mapping.json`.

**Verification:**
- `tests/faculty-display.test.js` passes.
- Editor schedule (`index.html`) renders identical faculty colors to a pre-refactor screenshot for every known instructor.

---

- [ ] **Unit 5: Read course titles from the canonical catalog and fix DESN 215 casing**

**Goal:** Remove `COURSE_TITLE_OVERRIDES`; load all course titles from `data/course-catalog.json`; correct the existing drift (part of R5).

**Requirements:** R5

**Dependencies:** Independent of Units 1–4; can land in parallel after Unit 4 to keep PRs reviewable.

**Files:**
- Modify: `pages/public-schedule.js` (drop `COURSE_TITLE_OVERRIDES`; have `getCanonicalCourseTitleByCode` consult only the loaded catalog)
- Modify: `data/course-catalog.json` (verify `DESN 215` title is `"InDesign"`; correct if not)
- Modify: `scripts/supabase-sync-course-catalog.sql` (verify `DESN 215` row; correct if needed so SQL and JSON agree)
- Test: `tests/public-schedule.test.js` (drop assertions that depend on `COURSE_TITLE_OVERRIDES`; add catalog-driven assertions)
- Test: `tests/supabase-course-catalog-sync.test.js` (loosen brittle exact-text assertions per review P3 #21; assert structural correctness instead)

**Approach:**
- `getCanonicalCourseTitleByCode(code, fallback, catalogByCode)` becomes a two-step lookup: `catalogByCode[code]?.title || fallback`. Remove the override block entirely. *Scope note:* RPC-row shape validation and unicode-dash normalization are Unit 9's responsibility; Unit 5 handles only the title-resolution path.
- Spot-check every course currently in `COURSE_TITLE_OVERRIDES` against `data/course-catalog.json`; for any title that differs, the catalog wins and the migration corrects the catalog (with a brief note in PR description) only after confirming the catalog form is the desired public-display form. If a public-display variant is genuinely needed for a specific code, add a `publicTitle` field to the catalog row and prefer it when present.
- The SQL sync file's INSERT/UPDATE statements must match the JSON for every DESN code; rerun the sync against staging as part of release validation.

**Patterns to follow:**
- Existing `loadCourseCatalog` / `createCourseCatalogByCode` in `pages/public-schedule.js`.

**Test scenarios:**
- *Happy path:* `getCanonicalCourseTitleByCode('DESN 215', '', catalogByCode)` returns `'InDesign'` (after correction).
- *Happy path:* Every code in the schedule fixture renders with the title from `data/course-catalog.json`.
- *Edge case:* A course code not in the catalog falls back to the RPC-supplied `course_title`.
- *Edge case:* A course with whitespace variants (`"DESN  215"`, lowercase) normalizes to the canonical lookup.
- *Integration:* The pre-existing brittle assertions in `tests/supabase-course-catalog-sync.test.js` are replaced with: "every DESN code in the JSON catalog appears in the SQL INSERT block with the same title", asserting parity rather than literal text matches.

**Verification:**
- All public-schedule tests pass.
- A new drift-detection test compares `data/course-catalog.json` titles to the INSERT tuples in `scripts/supabase-sync-course-catalog.sql` and fails if any DESN code differs.
- Manual: load the rendered public schedule and confirm DESN 215 displays as `InDesign`.

---

- [ ] **Unit 6: Read room list and public-years list from canonical sources**

**Goal:** Remove the remaining hard-coded `ROOM_ORDER`, `ROOM_LABELS`, `PUBLIC_YEARS`, `DEFAULTS.year` blocks (part of R5).

**Requirements:** R5

**Dependencies:** Can land in parallel with Unit 5. Order: Units 4–5 land first (smaller, lower-risk), then Unit 6.

**Files:**
- Modify: `pages/public-schedule.js` (drop `ROOM_ORDER`, `ROOM_LABELS`, `PUBLIC_ROOM_SET`, `PUBLIC_YEARS`, `DEFAULTS.year`)
- Modify: `scripts/supabase-public-schedule-read.sql` (consider exposing distinct allowed years through a new RPC or column; the SQL allowlist stays the authority)
- Test: `tests/public-schedule.test.js`
- Test: `tests/supabase-public-schedule-read.test.js`

**Approach:**
- At init, the page fetches `data/room-constraints.json` and derives the room order/labels from rooms where `excludeFromGrid !== true`. Filter rule: a room is included in the grid if `excludeFromGrid` is absent, `false`, `null`, or `0`, and excluded only if it is the JavaScript boolean `true`. The fetch is memoized like the course catalog.
- For public years: the page fetches the available years from Supabase. If the existing RPC can cheaply return them, add a `WITH years AS (...)` block; otherwise add a small `get_public_schedule_years()` SQL function. The JS keeps a *fallback* constant (single year, current) only for the offline-render path.
- `DEFAULTS.year` becomes `(years[0] ?? '<single fallback>')` — the most recent year returned by the RPC.

**Patterns to follow:**
- Memoization pattern in `loadCourseCatalog`.
- SQL function shape in `scripts/supabase-public-schedule-read.sql`.

**Test scenarios:**
- *Happy path:* When the rooms RPC/file returns the canonical list, the grid renders columns in the same order as `data/room-constraints.json` (excluding `excludeFromGrid`).
- *Happy path:* When the years RPC returns `['2026-27', '2025-26']`, the year selector shows both and defaults to `2026-27`.
- *Edge case:* A course scheduled in room `'207'` (marked `excludeFromGrid: true`) is filtered out exactly as today; assert via a fixture row.
- *Edge case:* A course scheduled in a *new* room (e.g., `'CEB 105'`) added to `data/room-constraints.json` appears in the grid without code changes. This is the regression-prevention test for the silent-drop bug.
- *Error path:* If the years RPC fails, the page falls back to the single hardcoded current year and renders a degraded-source banner. Empty schedule renders, no crash.
- *Integration:* The SQL test asserts the years function or the RPC return shape includes the `v_allowed_years` set.

**Verification:**
- All tests pass.
- Manual: temporarily add a fake room to `data/room-constraints.json`, reload `public-schedule.html`, and confirm the new column appears with no JS change.

---

- [ ] **Unit 7: Extract Foundry tokens to a shared CSS file**

**Goal:** Single source of Foundry tokens so editor and public-schedule cannot drift visually (R7).

**Requirements:** R7

**Dependencies:** Independent; can land any time after Unit 1 lands.

**Files:**
- Create: `css/foundry-theme.css` (extract the `.foundry-production` CSS variable + rule block currently inlined in `index.html`)
- Modify: `index.html` (remove the inline `.foundry-production` block; add `<link rel="stylesheet" href="css/foundry-theme.css">`)
- Modify: `public-schedule.html` (add `<link>` to `css/foundry-theme.css` before `css/public-schedule.css`)
- Modify: `css/public-schedule.css` (remove any Foundry-token definitions that now live in `foundry-theme.css`; keep public-schedule-only layout rules)

**Approach:**
- Identify the exact CSS variable block (`--foundry-*` custom properties) and `.foundry-production` selectors added to `index.html` on this branch.
- Move them verbatim into `css/foundry-theme.css` under a single `:root` block (for variables) and the original selectors (for rule blocks).
- Confirm no other CSS rules in `index.html` or `css/public-schedule.css` redefine the same variables; if they do, decide whether they're page-specific overrides (keep) or duplicates (remove).

**Test scenarios:**

Test expectation: none — pure CSS extraction with no behavioral change. Verification is visual.

**Verification:**
- Diff `index.html` against pre-extraction state: only the `<link>` tag and the deleted CSS block change.
- Visual: side-by-side screenshots of `index.html` and `public-schedule.html` before/after show no rendering differences. Use the existing `public-schedule-*.png` screenshots in the worktree as baselines.

---

- [ ] **Unit 8: Resolve DOMContentLoaded race and harden RPC load path**

**Goal:** No null-client failures; bounded loading; real failure-vs-empty distinction (R6, R8).

**Requirements:** R6, R8

**Dependencies:** Can land any time; small, contained.

**Files:**
- Modify: `pages/public-schedule.js` (ordering guard + timeout + tighter error check)
- Modify: `js/supabase-config.js` (expose an explicit `whenSupabaseReady()` promise that resolves after `initSupabase()` completes)
- Test: `tests/public-schedule.test.js`

**Approach:**
- `js/supabase-config.js` exposes `window.whenSupabaseReady` — a promise that resolves with the configured client (or rejects on configuration error). The existing DOMContentLoaded handler resolves it after `initSupabase()` finishes.
- `pages/public-schedule.js`'s init `await`s `whenSupabaseReady` before calling `getClient()`. Removes the ordering footgun.
- `load(year)` wraps the RPC call in `Promise.race` with a 10-second timeout that rejects with a typed error; catalog fetch gets a 5-second `AbortController` timeout.
- After the RPC resolves, validate `Array.isArray(data)`; throw a clear error if not. This is the "silent success on `{data: null, error: null}`" fix.
- The error-state renderer (`renderErrorState`) gets a null guard on `getElementById` per review P3 #18.

**Test scenarios:**
- *Happy path:* `whenSupabaseReady` resolves; `load()` runs against a mocked client and renders the grid.
- *Edge case:* `whenSupabaseReady` is awaited even if the public-schedule init handler fires first; assert via a test where the two DOMContentLoaded listeners are registered in reverse order.
- *Error path:* RPC takes >10s; `load()` rejects with the timeout error and the page shows the error state, not a stuck "Loading…" status.
- *Error path:* RPC returns `{data: null, error: null}`; `load()` throws "invalid response" and the page shows the error state.
- *Error path:* `data/course-catalog.json` returns a 404; catalog fetch aborts after 5s; rendering falls back to RPC-supplied titles (or canonical mapping if Unit 5 has landed) without hanging.
- *Edge case:* `getElementById('publicScheduleGrid')` returns null (HTML structure error); `renderErrorState` returns silently rather than throwing.
- *Empty state:* RPC returns an empty array; `renderEmptyState` runs and the "No public schedule rows are available" message appears. This is the previously-untested branch from review testing gap #2.

**Verification:**
- All scenarios pass in `tests/public-schedule.test.js`.
- Manual: throttle Supabase to "Slow 3G" in DevTools; confirm the page shows an error after 10s, not a perpetual loading spinner.

---

- [ ] **Unit 9: Unicode-dash time-slot parsing + RPC column validation + drift-detection test**

**Goal:** Defensive parsing of time slots and RPC payload validation; automated drift detection that would have caught the DESN 215 issue (R9).

**Requirements:** R9

**Dependencies:** Lands after Units 1–6 so the new sources of truth are in place.

**Files:**
- Modify: `pages/public-schedule.js` (`formatTimeSlot`, `getTimeSlotParts`, `normalizePublicScheduleRows`)
- Create: `tests/canonical-data-drift.test.js`
- Modify: `tests/public-schedule.test.js`

**Approach:**
- Update the time-slot parsers to split on `/[‐-―−-]/` (hyphen-minus + en-dash + em-dash + minus sign).
- In `normalizePublicScheduleRows`, validate each row has the expected fields (`day_pattern`, `time_slot`, `course_code`, `instructor_name`, `room_code`). Throw a clear typed error naming the missing column if any required field is undefined on a non-empty payload. This surfaces RPC contract drift the moment it occurs. *Scope note:* this unit introduces defensive RPC-shape validation that Units 1–8 did not. Unit 5 (title resolution) and Unit 6 (canonical year/room loading) assume the rows are already well-formed; Unit 9 is what enforces that assumption.
- New drift test compares `data/course-catalog.json` against `scripts/supabase-sync-course-catalog.sql` (titles, credits, level) and against `js/faculty-display.js` (faculty names match `scripts/faculty-mapping.json`).

**Test scenarios:**
- *Happy path:* `formatTimeSlot('10:00-12:20')` returns `'10:00 AM - 12:20 PM'` (existing behavior).
- *Edge case:* `formatTimeSlot('10:00–12:20')` (en-dash) returns the same formatted string.
- *Edge case:* `formatTimeSlot('10:00—12:20')` (em-dash) and `'10:00−12:20'` (minus) likewise.
- *Error path:* `normalizePublicScheduleRows([{...missing day_pattern}])` throws an `Error` whose message names `day_pattern` as the missing field.
- *Happy path:* For each DESN code in `data/course-catalog.json`, the `scripts/supabase-sync-course-catalog.sql` INSERT has the same title; the drift test fails loudly if not.
- *Happy path:* For each canonical name in `scripts/faculty-mapping.json`, `js/faculty-display.js` resolves to a known entry; the drift test fails if a mapping key has no display entry.

**Verification:**
- `tests/canonical-data-drift.test.js` passes against the post-Unit-5 state of the repo.
- Intentional drift (manually change `'InDesign'` to `'Indesign'` in either file) fails the test with a clear diff.

## System-Wide Impact

- **Interaction graph:** Units 1, 2, and 8 touch the auth/data path that runs before every public-schedule render. A regression here is a page-down event for the public view. Validate Unit 1 against the editor (which still uses overrides on localhost) and Unit 8 against the empty-quarter path.
- **Error propagation:** Unit 8 changes the "stuck on Loading" outcome into a deterministic error state. Confirm the error state in `css/public-schedule.css` is styled and visible — there's a `public-schedule-error-state.png` screenshot in the worktree suggesting this was visualized before; reconcile against it.
- **State lifecycle risks:** Unit 4 introduces a memoized JSON fetch shared across pages. If `js/faculty-display.js` is loaded by the editor and then the public view in the same browser session, the cache must serve both correctly (deterministic on the same JSON file).
- **API surface parity:** Unit 2 is the only externally-observable contract change. Anything that today silently calls `supabase.from('scheduled_courses').select(...)` from an anon context will break. Search the codebase for direct table calls before merging Unit 2; the RPC has been the contract per `auth-contract.md` but enforcement was loose.
- **Integration coverage:** Unit 5's drift-detection test and Unit 8's whenReady promise both cover behaviors that unit-level mocks would miss. Keep them as integration-style tests against real JSON files and a fake-but-shaped Supabase client.
- **Unchanged invariants:** The `get_public_schedule` RPC's return shape stays the same throughout this plan. Editor read paths via authenticated sessions are not affected by Unit 2 (auth'd users still SELECT directly). The IIFE module pattern from CLAUDE.md is preserved by every new JS module.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Unit 2 (RLS tightening) breaks an authenticated read path that today relies on the loose `"Public read"` policy. | Audit the codebase for direct `from('scheduled_courses').select(...)` and `from('faculty').select(...)` calls before merging Unit 2. Run in staging first; the rollback script restores the old policy in one command. |
| Unit 5 corrects DESN 215 in `data/course-catalog.json` but a user expects the JS-override form. | Confirm with the user (or via the existing release checklist) that "InDesign" is the desired public-display form before flipping; the SQL canonical already uses it. Add a `publicTitle` field on the catalog row if a different display form is genuinely needed. |
| Unit 6's "fetch years from Supabase" path adds a second network call on first paint, slowing the public view. | Memoize the call; ship the most recent year as the hardcoded fallback so the initial render doesn't block on the years RPC. Years can be revealed in the tab strip once the call resolves. |
| Unit 8's 10-second timeout is too aggressive on slow networks and surfaces an error state to legitimate slow loads. | Make the timeout configurable via `window.PROGRAM_COMMAND_SUPABASE_CONFIG.publicScheduleTimeoutMs`; default 10s. Re-tune after observing real-world load times. |
| Unit 4 introduces a third place that consumes `scripts/faculty-mapping.json`, increasing the surface area for a breaking change to that file. | The drift test in Unit 9 covers this: any change to the mapping that leaves a display entry orphaned (or vice versa) fails the suite. |
| Branch-level cleanup ("clean everything up in dev") is broader than this plan covers. | Listed as scope-out and tracked in Operational Notes below; user will decide which `codex/*` branches to delete separately. |

## Documentation / Operational Notes

- **Release checklist update (Unit 2):** Add an anon-SELECT verification step to `docs/public-schedule-release-checklist.md`. Add a paragraph documenting that the `?supabaseEnv=` / `?supabaseUrl=` / `?supabaseAnonKey=` overrides are intentionally local-only after Unit 1 lands.
- **Auth contract reaffirmation:** After Unit 2 ships, `docs/auth-contract.md` should call out that the public-table RLS policies are now restrictive — a one-line factual update, not a contract change.
- **Branch hygiene (deferred):** `git branch -r --merged origin/main` will list `codex/*` branches that can be safely deleted; `git for-each-ref --format='%(refname:short) %(committerdate:short)' refs/remotes/origin/codex/` will identify stale unmerged branches. Pair this with the user; do not delete remote branches autonomously. This is not gated by this plan and can proceed in parallel.

## Sources & References

- **Origin:** ce-review of `codex/internal-schedule-match-public-view` (2026-05-12), 10-reviewer parallel synthesis. P0 #1, P1 #2–#8, P2 #9–#16, P3 #18–#21.
- Existing plan: `docs/plans/2026-04-30-001-feat-public-schedule-view-plan.md` (defined the original public-schedule contract).
- `docs/auth-contract.md` — the contract Unit 2 enforces.
- `docs/public-schedule-release-checklist.md` — checklist Unit 2 updates.
- `CLAUDE.md` — IIFE pattern, canonical data file locations, course/year format conventions.
