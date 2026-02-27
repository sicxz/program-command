# Department Profile Schema v1

This schema defines the runtime configuration contract for department onboarding.

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

## Validation + Versioning

- Unsupported profile versions fail validation.
- Missing required fields fail validation.
- Runtime applies v1 defaults for optional fields.
- Migration hook entry point exists in `js/department-profile.js` (`migrateProfile`) for future version upgrades.
