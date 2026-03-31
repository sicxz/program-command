# Scheduler Pattern Storage Contract

## Decision

`scheduled_courses.day_pattern` and `scheduled_courses.time_slot` remain plain text identifiers, but their meaning is frozen per academic year by a snapshot stored on `academic_years`.

This avoids introducing global scheduler dimension tables before the DB-first cutover while still preserving historical meaning when program meeting patterns evolve.

## Canonical Stored Shape

### `public.academic_years`

- `scheduler_profile_version`: optional profile/version label such as `design-v1@v1`
- `scheduler_profile_snapshot`: normalized JSON snapshot with:
  - `dayPatterns[]`: `{ id, label, aliases[] }`
  - `timeSlots[]`: `{ id, label, aliases[], startMinutes, endMinutes }`

### `public.scheduled_courses`

- `day_pattern`: canonical `dayPatterns[].id` for that academic year, or `null`
- `time_slot`: canonical `timeSlots[].id` for that academic year, or `null`

Reserved special placements:

- `day_pattern = "ONLINE"` stores `time_slot = "async"` unless a more specific online label is supplied
- `day_pattern = "ARRANGED"` stores `time_slot = "arranged"` unless a more specific arranged label is supplied

## Normalization Rules

1. When an academic year is created, the active profile's scheduler contract is copied into `academic_years.scheduler_profile_snapshot`.
2. If an academic year already exists without the scheduler snapshot/version columns populated, the app backfills those fields once and keeps the existing year record.
3. Save paths normalize aliases to canonical ids before writing rows.
4. Once an academic year already has a scheduler snapshot, later profile edits do not silently overwrite it.
5. Historical rows are interpreted against that academic year's frozen snapshot, not against whatever profile is currently active in the UI.

## Why This Contract

- Keeps the stored row shape simple for the DB-first cutover in `#190`
- Lets `day_pattern` / `time_slot` stay profile-scoped instead of forcing a second migration into global lookup tables
- Preserves backfill and reload correctness when future profiles add aliases, rename labels, or change slot lengths
- Allows old rows to be normalized on the next save without rewriting the entire schema

## Backfill Expectations

- Existing `academic_years` records should be backfilled with the correct scheduler snapshot before DB-first hydration is enabled in production.
- Existing `scheduled_courses` rows can remain text; if they contain alias spellings, the canonicalization path can normalize them on a subsequent save for that year.
- The RPC and base schema both treat `day_pattern` and `time_slot` as `TEXT` so future profile ids are not constrained by legacy width limits.

## Non-Goals

- No separate scheduler-pattern admin UI yet
- No global `day_patterns` or `time_slots` reference tables yet
- No automatic rewrite of historical years when profile JSON changes

## References

- Issue: `#198`
- Parent epic: `#191`
- DB-first dependency: `#190`
- Migration: [scripts/supabase-academic-year-scheduler-contract-a07.sql](../scripts/supabase-academic-year-scheduler-contract-a07.sql)
- Save contract: [docs/scheduler-save-contract.md](./scheduler-save-contract.md)
