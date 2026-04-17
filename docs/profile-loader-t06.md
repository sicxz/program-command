# Profile Loader (T-06)

Issue: [#104](https://github.com/sicxz/program-command/issues/104)

## Runtime Singleton

File:

- `js/profile-loader.js`

Public API:

- `ProfileLoader.init(programId?, options?)`
- `ProfileLoader.get(path, fallback?)`
- `ProfileLoader.getAll()`
- `ProfileLoader.isLoaded()`

## Resolution Order

1. Supabase `programs.config` (when `getSupabaseClient()` is available and runtime context identifies a canonical program target)
2. Runtime default profile from `DepartmentProfileManager.getDefaultProfile()` (if available)
3. Embedded EWU Design fallback profile

Profiles are cached in-memory after first load. Use `init(..., { forceRefresh: true })` to refresh.

## Canonical Config Shape

`ProfileLoader` accepts either:

- a raw profile stored directly in `programs.config`
- or a metadata envelope with the runtime profile at `programs.config.profile`

The canonical Design seed in `scripts/supabase-program-config-seed-t07.sql` uses the envelope form.

## Current Integration

- `js/schedule-manager.js` now checks `ProfileLoader.get(...)` for:
  - `workload.defaultAnnualTargets`
  - `workload.appliedLearningCourses`
- falls back to existing constants if loader data is not available.
