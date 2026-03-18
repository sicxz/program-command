# Scheduler Storage Contract

## Purpose
This document freezes the storage contracts that must remain stable as Program Command moves from local/profile-backed scheduling to DB-first persistence.

It covers two linked contracts:

1. Scheduler meeting-pattern storage for `scheduled_courses.day_pattern` and `scheduled_courses.time_slot`
2. Year-aware room inventory storage for `rooms`, `academic_years`, and `scheduled_courses.room_id`

These contracts are prerequisites for the DB-first cutover in issue `#190` and for follow-on year-aware room work in issues `#199`, `#200`, and `#201`.

## Contract A: Scheduler Day/Slot IDs

### Canonical stored values
- `scheduled_courses.day_pattern` stores the canonical `scheduler.dayPatterns[].id`
- `scheduled_courses.time_slot` stores the canonical `scheduler.timeSlots[].id`
- Stored values are IDs only, not labels, aliases, or rendered text
- Reserved non-grid sentinels remain `ONLINE` and `ARRANGED`

### Why IDs are the contract
- The runtime already treats day/slot values as stable identifiers rather than display labels
- The schedule sync key in `index.html:14123` depends on canonical `day_pattern` and `time_slot`
- The builder save path persists `day_pattern` and `time_slot` directly from parsed slot keys in `pages/schedule-builder.js:2671-2699`
- The database layer already saves these fields as first-class persisted columns in `js/db-service.js:570-571`

### Interpretation rule
Canonical day/slot IDs must be interpreted against a year-scoped frozen scheduler snapshot, not against the latest live department profile.

That means `academic_years` needs scheduler metadata that preserves the exact meaning of each saved ID for that year. The recommended shape is:

- `scheduler_profile_version`
- `scheduler_profile_snapshot JSONB`

The snapshot should preserve:

- `dayPatterns[].id`
- `dayPatterns[].label`
- `dayPatterns[].aliases`
- `timeSlots[].id`
- `timeSlots[].label`
- `timeSlots[].aliases`
- `timeSlots[].startMinutes`
- `timeSlots[].endMinutes`

### Guardrails
- Persist canonical IDs only
- Keep IDs delimiter-safe while composite slot keys still use string joining
- Canonicalize legacy aliases during migration before DB-first cutover
- Do not rely on lexical DB ordering for scheduler display order
- Resolve ordering, rendering, and validation from the year snapshot

### Migration/backfill requirements
- Backfill each academic year with a frozen scheduler snapshot before DB-first save becomes authoritative
- Widen `scheduled_courses.day_pattern` and `scheduled_courses.time_slot` beyond the current conservative varchar limits before cutover
- Reject or flag any persisted row whose saved ID cannot be resolved against its academic-year snapshot

## Contract B: Year-Aware Room Inventory

### Canonical model
Rooms are year-scoped inventory snapshots, not a single mutable department-wide list.

The target contract is:

- `rooms` rows belong to exactly one `academic_year_id`
- `scheduled_courses.room_id` points to the year-specific `rooms.id`
- room records are cloned forward into a new academic year instead of being mutated in place
- each room row includes a stable `room_key` for logical identity across years
- `room_code` remains the user-facing label shown in UI, exports, and printed schedules

### Why `room_key` and `room_code` are separate
- `room_code` is allowed to change when a room is renamed, renumbered, or moved to another campus
- `room_key` preserves the identity of the functional room across academic years without rewriting historical schedules
- a historical `2025-26` schedule must continue to resolve to the `2025-26` room snapshot even if the same lab becomes `SPK 315` in `2026-27`

### Why this contract is needed now
Current runtime paths still resolve rooms without academic-year context:

- `index.html:14322-14339` loads `rooms` by `department_id` only and maps `room_code -> id`
- `js/db-service.js:264-277` reads `rooms` by `department_id` only
- `js/db-service.js:911-922` looks up `room_code` without year context
- `pages/schedule-builder.js:2677-2699` saves room assignments through that yearless lookup path

Those assumptions are acceptable only as a temporary pre-migration state. They are not the long-term contract.

### Required schema direction
- add `academic_year_id` to `rooms`
- add `room_key`
- enforce uniqueness on `(academic_year_id, room_code)`
- enforce uniqueness on `(academic_year_id, room_key)`
- require every scheduler/runtime room lookup to carry year context

### Runtime rules after cutover
- room dropdowns must show only rooms for the selected academic year
- room validation must resolve against the selected academic year only
- conflict checks, exports, and builder hydration must use year-scoped room rows
- any yearless `room_code` lookup is a bug once year-aware room inventory lands
- `data/room-constraints.json` remains seed/fallback data, not the live production source of truth

### Migration/backfill requirements
- clone or backfill room inventory per academic year before DB-first room hydration becomes authoritative
- preserve prior-year rows unchanged when a room number, label, or campus changes in a later year
- move functional-room rules away from raw `room_code` and onto `room_key` or year-scoped rule rows

## Acceptance Snapshot
This contract is considered satisfied when all of the following remain true:

- scheduler saves continue to round-trip canonical day/slot IDs
- changing the current live profile does not reinterpret historical saved schedules
- `2025-26` and `2026-27` can carry different room inventories and room labels
- a room change in a future year does not alter historical schedules
- any new room lookup code requires academic-year context

## Implementation Order
1. Freeze this contract in docs
2. Update index/runtime lookups to be year-aware
3. Update builder/conflicts/export consumers to use year-scoped room inventory
4. Backfill and verify next-year room snapshots
5. Fold both contracts into the DB-first cutover
