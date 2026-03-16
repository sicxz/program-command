# Issue #23 — Atomic schedule save: resolution

**Issue:** [P2] Make schedule save fully atomic (transaction/RPC-backed sync)

## Status: satisfied

Year-scoped schedule save is atomic via the Supabase RPC path. The app uses the RPC when available and falls back to a safer client-side sync order when the RPC is not yet deployed.

## Implementation

1. **Contract and failure matrix:** [scheduler-save-contract.md](scheduler-save-contract.md) — defines the canonical save contract and failure behavior.
2. **RPC:** [scripts/supabase-schedule-sync-rpc.sql](../scripts/supabase-schedule-sync-rpc.sql) — `public.sync_scheduled_courses_for_academic_year(uuid, jsonb)` performs a single transactional sync for the year (update/insert/delete in one transaction).
3. **App save path:** Scheduler save flow (e.g. in `index.html`) calls `syncScheduledCoursesViaRpc` first; on success, no client-side delete-then-insert is used. Fallback `syncScheduledCoursesViaClientDiff` uses update-then-insert-then-delete order to avoid partial wipes.

## Acceptance

- **Year-scoped save is atomic:** Yes, when the RPC is deployed and used.
- **Failed save leaves no partial writes:** RPC transaction rolls back on error; client does not mutate local draft on failure (per contract).
- **Regression/verification:** See Tree/C-04 rollback test and C-07 policy smoke-check in [AUTOPILOT_HANDOFF_2026-02-27.md](../AUTOPILOT_HANDOFF_2026-02-27.md).

Closes #23.
