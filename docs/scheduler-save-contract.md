# Scheduler Save Contract and Failure Matrix (Tree/C-01)

## Purpose

Define the canonical save contract for scheduler writes so C-02/C-03/C-04 can implement and verify an atomic, year-scoped save path.

## Scope

- Single department context.
- Single academic year per request.
- Target table: `public.scheduled_courses`.
- Target RPC: `public.sync_scheduled_courses_for_academic_year(uuid, jsonb)` in [scripts/supabase-schedule-sync-rpc.sql](../scripts/supabase-schedule-sync-rpc.sql).

## Legacy Path Being Replaced

`pages/schedule-builder.js` currently performs a destructive `delete()` then `insert()` sequence in `saveToDatabase()`. This path is non-atomic and must be removed once the RPC path is wired in.

## Request Contract

Top-level payload:

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `academicYearId` | UUID string | Yes | Must reference an existing `academic_years.id`; all persisted rows are scoped to this value only. |
| `records` | array<object> | Yes | May be empty (represents "no scheduled rows for this academic year"). |

Record shape (`records[]`), mapped to RPC `p_records` JSON objects:

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `course_id` | UUID string or `null` | No | Nullable for placeholder/unmapped rows. |
| `faculty_id` | UUID string or `null` | No | Nullable for TBD/unassigned faculty. |
| `room_id` | UUID string or `null` | No | Nullable for room TBD. |
| `quarter` | string | Yes | Must be non-empty after trim. |
| `day_pattern` | string or `null` | No | Optional meeting pattern. |
| `time_slot` | string or `null` | No | Optional time slot. |
| `section` | string or `null` | No | Default to `001` when omitted in UI mapping. |
| `projected_enrollment` | integer or `null` | No | Parseable integer when provided. |
| `updated_at` | ISO timestamp or `null` | No | If omitted, server uses `now()`. |

## Save Semantics

1. Client validates and normalizes payload before network call.
2. Client performs one RPC call per save action, scoped to one `academicYearId`.
3. RPC applies a transactional sync for that year:
   - update rows that match incoming sync key
   - insert new rows
   - delete stale rows for that year
4. RPC returns `{ updated_count, inserted_count, deleted_count }`.

## Response Contract (Client-Level)

Client code should normalize success/failure into:

```json
{
  "ok": true,
  "counts": { "updated": 0, "inserted": 0, "deleted": 0 },
  "totalAffected": 0
}
```

On error:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION|NETWORK|RLS|CONSTRAINT|UNKNOWN",
    "message": "human-readable detail",
    "retryable": true
  }
}
```

## Invariants

- Atomic by academic year: all changes commit together or none commit.
- No destructive pre-delete outside the transaction path.
- Idempotent for repeated identical payloads.
- Persisted saved schedule state is canonical for the targeted academic year once the save succeeds.
- Local draft state may exist for in-progress editing, but it must not replace canonical persisted schedule truth on reload.
- Local draft state is not mutated on failed save.
- Save errors are surfaced with actionable guidance.

## Failure Matrix

| Failure class | Example trigger | Expected DB state | Expected client result |
| --- | --- | --- | --- |
| Validation | Missing `academicYearId`, empty `quarter`, non-numeric enrollment | Unchanged (RPC not called) | `ok:false`, `code=VALIDATION`, inline fix prompt |
| Lookup normalization | Unknown `course_id`/`faculty_id` mapping before request assembly | Unchanged (RPC not called) | `ok:false`, `code=VALIDATION`, identify bad row(s) |
| Network/transport | Timeout, DNS, dropped connection before response | Indeterminate commit status | `ok:false`, `code=NETWORK`, keep local draft and offer retry/reload check |
| RPC input rejection | RPC raises `p_academic_year_id is required` | Unchanged (transaction aborted) | `ok:false`, `code=VALIDATION` |
| RLS/permission | Policy denies write for caller | Unchanged (transaction aborted) | `ok:false`, `code=RLS`, do not clear local draft |
| DB constraint/runtime | FK violation, unexpected DB error | Unchanged (transaction aborted) | `ok:false`, `code=CONSTRAINT` or `UNKNOWN` |

## Downstream Implementation Notes

- C-02: expose the RPC path in app persistence services and retire non-transactional write sequencing.
- C-03: route scheduler UI save through the RPC path exclusively and remove legacy delete-then-insert runtime logic.
- C-04: add regression tests proving rollback safety and local draft immutability on save failure.

## References

- Issue: [#53](https://github.com/sicxz/program-command/issues/53)
- Parent: [#1](https://github.com/sicxz/program-command/issues/1)
- RPC SQL: [scripts/supabase-schedule-sync-rpc.sql](../scripts/supabase-schedule-sync-rpc.sql)
- Current legacy path: [pages/schedule-builder.js](../pages/schedule-builder.js)
