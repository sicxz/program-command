# Department Profile Schema v1

This schema defines the runtime configuration contract for department onboarding.

## Current Runtime Position

This document describes the current v1 local profile runtime contract. It is still relevant for the existing onboarding shell, but it is not yet the full canonical multi-department platform contract.

Today the repo also contains a newer program-aware path through `js/profile-loader.js` and related Supabase-backed runtime behavior. During the production-readiness audit, treat this document as one side of a hybrid platform state rather than the final source of truth by itself.

The runtime identity path is now more explicit than the original local-profile-only shell: active profile, Program Command shell selection, and onboarding context are consulted before the embedded Design bootstrap default is used.

## Top-Level Fields

- `version` (number, required): schema version. Current runtime supports `1`.
- `id` (string, required): unique profile id, for example `design-v1`.
- `identity` (object, required):
  - `name` (string, required)
  - `code` (string, required)
  - `displayName` (string, required)
  - `shortName` (string, optional)
- `branding` (object, optional):
  - `appTitle` (string)
  - `headerEyebrow` (string)
  - `headerSubtitle` (string)
  - `textSlots` (object map, optional): profile-driven UI labels/help copy
  - `themeTokens` (object): key/value map applied to CSS vars using `--pc-<token-name>`
- `academic` (object, required):
  - `system` (string, currently `quarter`)
  - `quarters` (array of strings, required)
  - `defaultTargetYearMode` (string, optional)
  - `defaultWorkloadImportYearMode` (string, optional)
  - `defaultSchedulerYear` (string, optional)
- `scheduler` (object, required):
  - `storageKeyPrefix` (string, required)
  - `allowedRooms` (array of strings, optional)
  - `dayPatterns` (array, optional): each entry can define:
    - `id` (string, required)
    - `label` (string, optional)
    - `aliases` (array of strings, optional)
  - `timeSlots` (array, optional): each entry can define:
    - `id` (string, required)
    - `label` (string, optional)
    - `aliases` (array of strings, optional)
    - `startMinutes` (number, optional)
    - `endMinutes` (number, optional)
  - `roomLabels` (object map, optional): room code to display label
- `workload` (object, required):
  - `dashboardTitle` (string, optional)
  - `dashboardSubtitleBase` (string, optional)
  - `productionResetDefaultScheduleYear` (string, optional)
  - `defaultAnnualTargets` (object, optional)
- `import` (object, optional):
  - `clss.roomMatchPriority` (array of strings, optional)
  - `clss.preferredMatchingOrder` (array of strings, optional)
  - `clss.facultyAliases` (object map, optional): alias to canonical faculty name
  - `clss.courseAliases` (object map, optional): alias code to canonical course code

## Runtime Loader

The runtime loads profiles from:

- Manifest: `department-profiles/manifest.json`
- Profile JSON: `department-profiles/<profile-file>.json`

The active profile id is stored in localStorage key:

- `programCommandActiveDepartmentProfileId`

If manifest/profile loading fails or validation fails, runtime falls back to the embedded default profile (`design-v1`) and emits warnings.

For release-gated behavior, treat that embedded fallback as bootstrap-only. It is acceptable for setup and local preview work, but it is not the canonical platform contract for additional departments.

## Release-Gate Implication

The platformization pillar cannot pass while manifest/file loading, embedded `design-v1` fallback behavior, and Supabase-backed program configuration all remain implicit peers. The release-gated platform needs one explicitly documented canonical runtime model, with any remaining fallback behavior clearly bounded.

## Validation + Versioning

- Unsupported profile versions fail validation.
- Missing required fields fail validation.
- Runtime applies v1 defaults for optional fields.
- Runtime emits contrast warnings when branding foreground/background header tokens fail a 4.5:1 ratio check.
- Migration hook entry point exists in `js/department-profile.js` (`migrateProfile`) for future version upgrades.
